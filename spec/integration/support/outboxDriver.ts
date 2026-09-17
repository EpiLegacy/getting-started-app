import { sql } from 'drizzle-orm';
import type { PoolConnection } from 'mysql2/promise';
import { getPool, withTransaction as withTransactionLegacy } from '../../../src/infrastructure/db/mysql';
import * as outboxRepositoryLegacy from '../../../src/infrastructure/outbox/outboxRepository';
import type { PendingEvent } from '../../../src/infrastructure/outbox/outboxRepository';
import type { EventEnvelope } from '../../../src/shared/events/envelope';
import { startOutboxRelay as startOutboxRelayLegacy } from '../../../src/infrastructure/outbox/relay';
import { updateTask as updateTaskLegacy } from '../../../src/modules/tasks/application/updateTask';
import { handleTaskEvent as handleTaskEventLegacy } from '../../../src/workers/notifications/handler';
import { type DrizzleTx, transaction as transactionDrizzle } from '../../../src/infrastructure/db/drizzle';
import * as outboxRepositoryDrizzle from '../../../src/infrastructure/outbox/outboxRepository.drizzle';
import { startOutboxRelay as startOutboxRelayDrizzle } from '../../../src/infrastructure/outbox/relay.drizzle';
import { updateTask as updateTaskDrizzle } from '../../../src/modules/tasks/application/updateTask.drizzle';
import { handleTaskEvent as handleTaskEventDrizzle } from '../../../src/workers/notifications/handler.drizzle';
import { gate } from './async';

/**
 * Makes spec/integration/outbox.spec.ts exercise the active implementation
 * of the outbox — legacy (src/infrastructure/outbox/*,
 * src/modules/tasks/application/updateTask.ts,
 * src/workers/notifications/handler.ts) or its Drizzle counterpart
 * (the sibling *.drizzle.ts files) — selected the same way
 * src/persistence/index.ts picks a Persistence implementation: by
 * PERSISTENCE_DRIVER, "legacy" by default.
 *
 * Everything below is a thin dispatcher. The guarantees under test (same
 * transaction, FOR UPDATE SKIP LOCKED, at-least-once delivery, worker
 * idempotency) are asserted once, in outbox.spec.ts, and hold for whichever
 * implementation runs.
 */
export const driverName = process.env.PERSISTENCE_DRIVER === 'drizzle' ? 'drizzle' : 'legacy';

/** A transaction/connection object `claimBatch`/`enqueue`/`markPublished` accept. */
export type Tx = PoolConnection | DrizzleTx;

// The active module's namespace object: spec/integration/outbox.spec.ts
// jest.spyOn()s `enqueue` on this to inject a pause inside a real
// transaction, and the spy must land on whichever implementation runs. The
// exported enqueue/claimBatch/markPublished below always look the function
// up on this object (rather than capturing a reference to it), so a spy
// installed here is what they end up calling.
export const outboxRepositoryModule = driverName === 'drizzle' ? outboxRepositoryDrizzle : outboxRepositoryLegacy;

export function enqueue(tx: Tx, event: EventEnvelope): Promise<void> {
    return outboxRepositoryModule.enqueue(tx as PoolConnection & DrizzleTx, event);
}

export function claimBatch(tx: Tx, limit: number): Promise<PendingEvent[]> {
    return outboxRepositoryModule.claimBatch(tx as PoolConnection & DrizzleTx, limit);
}

export function markPublished(tx: Tx, ids: number[]): Promise<void> {
    return outboxRepositoryModule.markPublished(tx as PoolConnection & DrizzleTx, ids);
}

export const updateTask = driverName === 'drizzle' ? updateTaskDrizzle : updateTaskLegacy;
export const startOutboxRelay = driverName === 'drizzle' ? startOutboxRelayDrizzle : startOutboxRelayLegacy;
export const handleTaskEvent = driverName === 'drizzle' ? handleTaskEventDrizzle : handleTaskEventLegacy;

export function withTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return driverName === 'drizzle' ? transactionDrizzle(fn as (tx: DrizzleTx) => Promise<T>) : withTransactionLegacy(fn);
}

export interface HeldTransaction {
    /** Resolves once the transaction is open and `SET SESSION` has run. */
    ready: Promise<Tx>;
    /** Rolls back and releases every resource the transaction held. */
    release(): Promise<void>;
}

/**
 * Opens a transaction and hands back the live tx/connection, held open until
 * release() rolls it back — the driver-agnostic equivalent of manually
 * calling beginTransaction()/rollback() on a raw PoolConnection, needed by
 * tests that hold several transactions open at once (a single
 * withTransaction() callback cannot do that: it commits or rolls back the
 * moment it returns). `innodb_lock_wait_timeout` is set to 1s so a test that
 * expects a lock wait fails fast instead of hanging for the default 50s.
 */
export function openHeldTransaction(): HeldTransaction {
    if (driverName === 'legacy') {
        const connectionPromise = (async (): Promise<PoolConnection> => {
            const connection = await getPool().getConnection();
            await connection.query('SET SESSION innodb_lock_wait_timeout = 1');
            await connection.beginTransaction();
            return connection;
        })();
        return {
            ready: connectionPromise,
            async release() {
                const connection = await connectionPromise;
                await connection.rollback();
                await connection.query('SET SESSION innodb_lock_wait_timeout = DEFAULT');
                connection.release();
            },
        };
    }

    let resolveTx!: (tx: DrizzleTx) => void;
    const readyPromise = new Promise<DrizzleTx>(resolve => (resolveTx = resolve));
    const releaseGate = gate();
    // Thrown to force a rollback once the caller is done with the
    // transaction, then swallowed below: db.transaction() has no API to
    // "hold open and roll back later" other than throwing from the callback.
    const RELEASE_SENTINEL = new Error('outboxDriver: releasing a held transaction');

    const settled = transactionDrizzle(async tx => {
        await tx.execute(sql`SET SESSION innodb_lock_wait_timeout = 1`);
        resolveTx(tx);
        await releaseGate.promise;
        throw RELEASE_SENTINEL;
    }).catch(error => {
        if (error !== RELEASE_SENTINEL) throw error;
    });

    return {
        ready: readyPromise,
        async release() {
            releaseGate.open();
            await settled;
        },
    };
}
