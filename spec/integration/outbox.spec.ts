import type { Connection, PoolConnection, RowDataPacket } from 'mysql2/promise';
import { ZodError } from 'zod';
import { closePool, ensureEventSchema, getPool, withTransaction } from '../../src/infrastructure/db/mysql';
import * as outboxRepository from '../../src/infrastructure/outbox/outboxRepository';
import { claimBatch, enqueue, markPublished, type PendingEvent } from '../../src/infrastructure/outbox/outboxRepository';
import { startOutboxRelay, type RunningRelay } from '../../src/infrastructure/outbox/relay';
import { updateTask } from '../../src/modules/tasks/application/updateTask';
import { TASK_COMPLETED } from '../../src/shared/events/catalog';
import { createEvent, type EventEnvelope } from '../../src/shared/events/envelope';
import type { EventPublisher } from '../../src/shared/events/publisher';
import { HANDLER_NAME, handleTaskEvent } from '../../src/workers/notifications/handler';
import { gate, sleep, stateAfter, waitUntil } from './support/async';
import {
    connect,
    countRows,
    countUnpublished,
    emptyTables,
    insertTodoRows,
    selectOutboxRows,
    selectTodoRows,
} from './support/database';

/*
 * Freezes the guarantees of the transactional outbox: a task change and its
 * event are committed together or not at all, concurrent relays never claim
 * the same event, delivery is at least once, and the worker applies an event
 * once. Tests titled "current behaviour, to be fixed" pin a real but unwanted
 * behaviour.
 */

// Loaded like src/index.ts does, to create todo_items the way the app does.
const db = require('../../src/persistence');

const realEnqueue = outboxRepository.enqueue;
let connection: Connection;

beforeAll(async () => {
    await db.init();
    await ensureEventSchema();
    connection = await connect();
});

beforeEach(async () => {
    await emptyTables(connection);
});

afterEach(() => {
    jest.restoreAllMocks();
});

afterAll(async () => {
    await connection?.end();
    await closePool();
    await db.teardown();
});

function taskCompleted(taskId: string, actorId: string | null = null): EventEnvelope {
    return createEvent({
        type: TASK_COMPLETED,
        version: 1,
        aggregateId: taskId,
        payload: { taskId, name: `Task ${taskId}`, completedAt: new Date().toISOString() },
        correlationId: `correlation-${taskId}`,
        actorId,
    });
}

/** Stores `count` unpublished events, in one transaction, and returns them in id order. */
async function seedEvents(count: number): Promise<EventEnvelope[]> {
    const events = Array.from({ length: count }, (_, index) => taskCompleted(`task-${index}`));
    await withTransaction(async tx => {
        for (const event of events) await enqueue(tx, event);
    });
    return events;
}

/**
 * Holds updateTask inside its transaction, right after the event insert, until
 * `release` is called.
 */
function holdUpdateTaskAfterEnqueue(): { reached: Promise<void>; release(): void } {
    const reached = gate();
    const released = gate();
    jest.spyOn(outboxRepository, 'enqueue').mockImplementationOnce(async (tx, event) => {
        await realEnqueue(tx, event);
        reached.open();
        await released.promise;
    });
    return { reached: reached.promise, release: released.open };
}

describe('updateTask', () => {
    const TASK = 'task-under-test';

    test('completing a task commits the new state and its event together', async () => {
        await insertTodoRows(connection, [[TASK, 'Write tests', 0]]);

        const updated = await updateTask({ id: TASK, name: 'Write tests', completed: true, correlationId: 'c-1' });

        expect(updated).toEqual({ id: TASK, name: 'Write tests', completed: true });
        expect(await selectTodoRows(connection)).toEqual([{ id: TASK, name: 'Write tests', completed: 1 }]);
        const events = await selectOutboxRows(connection);
        expect(events).toHaveLength(1);
        expect(events[0]).toMatchObject({
            type: TASK_COMPLETED,
            aggregate_id: TASK,
            correlation_id: 'c-1',
            actor_id: null,
            published_at: null,
            payload: { taskId: TASK, name: 'Write tests' },
        });
    });

    test('the task change and its event only become visible at commit, together', async () => {
        await insertTodoRows(connection, [[TASK, 'Write tests', 0]]);
        const hold = holdUpdateTaskAfterEnqueue();

        const running = updateTask({ id: TASK, name: 'Write tests', completed: true, correlationId: 'c-1' });
        await hold.reached;

        // Both writes are done, not committed: another connection sees neither.
        expect(await selectTodoRows(connection)).toEqual([{ id: TASK, name: 'Write tests', completed: 0 }]);
        expect(await countRows(connection, 'outbox_events')).toBe(0);

        hold.release();
        await expect(running).resolves.toEqual({ id: TASK, name: 'Write tests', completed: true });
        expect(await selectTodoRows(connection)).toEqual([{ id: TASK, name: 'Write tests', completed: 1 }]);
        expect(await countRows(connection, 'outbox_events')).toBe(1);
    });

    test('a failure after both writes rolls both back', async () => {
        await insertTodoRows(connection, [[TASK, 'Write tests', 0]]);
        jest.spyOn(outboxRepository, 'enqueue').mockImplementationOnce(async (tx, event) => {
            await realEnqueue(tx, event);
            throw new Error('crash between the event insert and the commit');
        });

        await expect(
            updateTask({ id: TASK, name: 'Renamed', completed: true, correlationId: 'c-1' }),
        ).rejects.toThrow('crash between the event insert and the commit');

        expect(await selectTodoRows(connection)).toEqual([{ id: TASK, name: 'Write tests', completed: 0 }]);
        expect(await countRows(connection, 'outbox_events')).toBe(0);
    });

    test('an event the database rejects rolls the task change back', async () => {
        await insertTodoRows(connection, [[TASK, 'Write tests', 0]]);

        // correlation_id is VARCHAR(64) and the server runs in strict mode.
        await expect(
            updateTask({ id: TASK, name: 'Renamed', completed: true, correlationId: 'x'.repeat(65) }),
        ).rejects.toHaveProperty('code', 'ER_DATA_TOO_LONG');

        expect(await selectTodoRows(connection)).toEqual([{ id: TASK, name: 'Write tests', completed: 0 }]);
        expect(await countRows(connection, 'outbox_events')).toBe(0);
    });

    test('an unknown task returns undefined and writes nothing', async () => {
        await insertTodoRows(connection, [[TASK, 'Write tests', 0]]);

        await expect(
            updateTask({ id: 'unknown', name: 'x', completed: true, correlationId: 'c-1' }),
        ).resolves.toBeUndefined();

        expect(await selectTodoRows(connection)).toEqual([{ id: TASK, name: 'Write tests', completed: 0 }]);
        expect(await countRows(connection, 'outbox_events')).toBe(0);
    });

    test('a concurrent completion of the same task waits for the first one and records no event', async () => {
        await insertTodoRows(connection, [[TASK, 'Write tests', 0]]);
        const hold = holdUpdateTaskAfterEnqueue();
        const first = updateTask({ id: TASK, name: 'Write tests', completed: true, correlationId: 'first' });
        await hold.reached;

        const second = updateTask({ id: TASK, name: 'Write tests', completed: true, correlationId: 'second' });
        expect(await stateAfter(second, 300)).toBe('pending');

        hold.release();
        await expect(first).resolves.toEqual({ id: TASK, name: 'Write tests', completed: true });
        await expect(second).resolves.toEqual({ id: TASK, name: 'Write tests', completed: true });
        // The second one read the task after the first commit: already completed.
        expect((await selectOutboxRows(connection)).map(event => event.correlation_id)).toEqual(['first']);
    });

    test('an event is recorded on the transition to completed only', async () => {
        await insertTodoRows(connection, [
            ['already-done', 'done', 1],
            ['still-open', 'open', 0],
        ]);

        await updateTask({ id: 'already-done', name: 'done', completed: true, correlationId: 'c-1' });
        await updateTask({ id: 'already-done', name: 'reopened', completed: false, correlationId: 'c-2' });
        await updateTask({ id: 'still-open', name: 'open', completed: false, correlationId: 'c-3' });
        expect(await countRows(connection, 'outbox_events')).toBe(0);

        await updateTask({ id: 'already-done', name: 'done again', completed: true, correlationId: 'c-4' });
        expect((await selectOutboxRows(connection)).map(event => event.correlation_id)).toEqual(['c-4']);
    });

    test('current behaviour, to be fixed: while a completion is in flight, every other write to todo_items waits', async () => {
        await insertTodoRows(connection, [
            [TASK, 'being completed', 0],
            ['someone-else', 'unrelated', 0],
        ]);
        const hold = holdUpdateTaskAfterEnqueue();
        const running = updateTask({ id: TASK, name: 'being completed', completed: true, correlationId: 'c-1' });
        await hold.reached;

        const other = await connect();
        try {
            // A lock wait fails after 1s instead of the default 50s.
            await other.query('SET SESSION innodb_lock_wait_timeout = 1');
            // SELECT ... FOR UPDATE has no index on id to use: it locks every
            // row of todo_items and every gap between them.
            await expect(
                other.execute('INSERT INTO todo_items (id, name, completed) VALUES (?, ?, ?)', ['new', 'new', 0]),
            ).rejects.toHaveProperty('code', 'ER_LOCK_WAIT_TIMEOUT');
            await expect(
                other.execute('UPDATE todo_items SET name = ? WHERE id = ?', ['renamed', 'someone-else']),
            ).rejects.toHaveProperty('code', 'ER_LOCK_WAIT_TIMEOUT');
            await expect(
                other.execute('DELETE FROM todo_items WHERE id = ?', ['someone-else']),
            ).rejects.toHaveProperty('code', 'ER_LOCK_WAIT_TIMEOUT');
            // Plain reads do not wait.
            expect(await selectTodoRows(other)).toHaveLength(2);
        } finally {
            await other.end();
            hold.release();
        }
        await expect(running).resolves.toEqual({ id: TASK, name: 'being completed', completed: true });
    });
});

describe('claimBatch and markPublished', () => {
    const eventIds = (batch: PendingEvent[]): string[] => batch.map(event => event.envelope.eventId);

    test('claims unpublished events in id order, up to the limit, as the envelopes that were stored', async () => {
        const events = await seedEvents(3);
        const withActor = taskCompleted('with-actor', 'user-7');
        await withTransaction(tx => enqueue(tx, withActor));
        const published = taskCompleted('already-published');
        await withTransaction(tx => enqueue(tx, published));
        const publishedRow = (await selectOutboxRows(connection)).find(row => row.event_id === published.eventId);
        await withTransaction(tx => markPublished(tx, [publishedRow!.id]));

        const firstTwo = await withTransaction(tx => claimBatch(tx, 2));
        expect(firstTwo.map(event => event.envelope)).toEqual(events.slice(0, 2));
        expect(firstTwo[0].id).toBeLessThan(firstTwo[1].id);

        // Claiming without marking leaves the events unpublished.
        const all = await withTransaction(tx => claimBatch(tx, 50));
        expect(all.map(event => event.envelope)).toEqual([...events, withActor]);
    });

    test('two relays holding claims at the same time get disjoint batches, without waiting', async () => {
        const events = await seedEvents(6);
        const relays: PoolConnection[] = [];
        try {
            for (let index = 0; index < 3; index++) {
                const relay = await getPool().getConnection();
                relays.push(relay);
                // A lock wait would fail after 1s instead of hanging.
                await relay.query('SET SESSION innodb_lock_wait_timeout = 1');
                await relay.beginTransaction();
            }
            const [first, second, third] = relays;

            const firstBatch = await claimBatch(first, 3);
            const secondBatch = await claimBatch(second, 3);
            const thirdBatch = await claimBatch(third, 10);

            expect(eventIds(firstBatch)).toEqual(events.slice(0, 3).map(event => event.eventId));
            expect(eventIds(secondBatch)).toEqual(events.slice(3).map(event => event.eventId));
            expect(thirdBatch).toEqual([]);
        } finally {
            for (const relay of relays) {
                await relay.rollback();
                await relay.query('SET SESSION innodb_lock_wait_timeout = DEFAULT');
                relay.release();
            }
        }
    });

    test('relays running side by side never commit the same event twice', async () => {
        const events = await seedEvents(40);
        const committed: string[] = [];

        const relay = async (): Promise<void> => {
            for (let attempt = 0; attempt < 200; attempt++) {
                let batch: PendingEvent[];
                try {
                    batch = await withTransaction(async tx => {
                        const pending = await claimBatch(tx, 3);
                        // Publishing takes a moment, during which the claim is held.
                        await sleep(5);
                        await markPublished(
                            tx,
                            pending.map(event => event.id),
                        );
                        return pending;
                    });
                } catch (error) {
                    // A deadlock is retried, as the relay does on its next tick.
                    if ((error as { code?: string }).code === 'ER_LOCK_DEADLOCK') continue;
                    throw error;
                }
                if (batch.length === 0) return;
                committed.push(...eventIds(batch));
            }
            throw new Error('relay did not drain the outbox');
        };
        await Promise.all([relay(), relay(), relay(), relay()]);

        expect(new Set(committed).size).toBe(committed.length);
        expect([...committed].sort()).toEqual(events.map(event => event.eventId).sort());
        expect(await countUnpublished(connection)).toBe(0);
    });

    test('a claim that is rolled back is claimed again (at-least-once delivery)', async () => {
        const events = await seedEvents(2);
        let firstClaim: PendingEvent[] = [];

        await expect(
            withTransaction(async tx => {
                firstClaim = await claimBatch(tx, 10);
                throw new Error('broker unreachable');
            }),
        ).rejects.toThrow('broker unreachable');

        const secondClaim = await withTransaction(tx => claimBatch(tx, 10));
        expect(firstClaim.map(event => event.envelope)).toEqual(events);
        expect(secondClaim.map(event => event.envelope)).toEqual(events);
    });

    test('markPublished stamps the given events only, and sends nothing for an empty list', async () => {
        await seedEvents(3);
        const rows = await selectOutboxRows(connection);
        const before = Date.now();

        await withTransaction(tx => markPublished(tx, [rows[0].id, rows[2].id]));
        await withTransaction(async tx => {
            const query = jest.spyOn(tx, 'query');
            await markPublished(tx, []);
            expect(query).not.toHaveBeenCalled();
        });

        const after = await selectOutboxRows(connection);
        expect(after.map(row => row.published_at === null)).toEqual([false, true, false]);
        expect(after[0].published_at!.getTime()).toBeGreaterThanOrEqual(before);
        expect(after[0].published_at!.getTime()).toBeLessThanOrEqual(Date.now());
    });

    test('claimBatch rejects a limit that is not a whole number, and never runs it as SQL', async () => {
        await seedEvents(2);

        await expect(withTransaction(tx => claimBatch(tx, 0))).resolves.toEqual([]);
        const invalid = [Number.NaN, -1, 1.5, Number.POSITIVE_INFINITY, '1; DELETE FROM outbox_events'];
        for (const limit of invalid) {
            await expect(withTransaction(tx => claimBatch(tx, limit as number))).rejects.toThrow();
        }

        expect(await countRows(connection, 'outbox_events')).toBe(2);
    });
});

describe('outbox relay', () => {
    function inMemoryPublisher(before?: (event: EventEnvelope) => Promise<void>): {
        publisher: EventPublisher;
        published: EventEnvelope[];
    } {
        const published: EventEnvelope[] = [];
        const publisher: EventPublisher = {
            async publish(event) {
                await before?.(event);
                published.push(event);
            },
            async close() {},
        };
        return { publisher, published };
    }

    async function stop(relay: RunningRelay): Promise<void> {
        relay.stop();
        // stop() only cancels the next tick: let a running one finish before
        // the pool is closed.
        await sleep(200);
    }

    beforeEach(() => {
        jest.spyOn(console, 'log').mockImplementation(() => {});
        jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    test('publishes pending events in order and marks them published', async () => {
        const events = await seedEvents(3);
        const { publisher, published } = inMemoryPublisher();

        const relay = startOutboxRelay(publisher, { intervalMs: 10 });
        try {
            await waitUntil(async () => (await countUnpublished(connection)) === 0);
        } finally {
            await stop(relay);
        }

        expect(published).toEqual(events);
        expect(console.log).toHaveBeenCalledWith('[outbox] published 3 event(s)');
    });

    test('keeps events unpublished while the broker fails, then publishes them once', async () => {
        const [event] = await seedEvents(1);
        let brokerUp = false;
        let failures = 0;
        const { publisher, published } = inMemoryPublisher(async () => {
            if (brokerUp) return;
            failures++;
            throw new Error('broker down');
        });

        const relay = startOutboxRelay(publisher, { intervalMs: 10 });
        try {
            await waitUntil(async () => failures >= 3);
            expect(await countUnpublished(connection)).toBe(1);
            expect(console.error).toHaveBeenCalledWith('[outbox] relay tick failed: broker down');

            brokerUp = true;
            await waitUntil(async () => (await countUnpublished(connection)) === 0);
        } finally {
            await stop(relay);
        }

        expect(published).toEqual([event]);
    });

    test('current behaviour, to be fixed: while the relay waits for the broker, completing a task waits, and creating one too', async () => {
        await seedEvents(1);
        await insertTodoRows(connection, [['task-1', 'to complete', 0]]);
        const publishing = gate();
        const brokerAnswers = gate();
        const { publisher } = inMemoryPublisher(async () => {
            publishing.open();
            await brokerAnswers.promise;
        });

        const relay = startOutboxRelay(publisher, { intervalMs: 10 });
        try {
            await publishing.promise;

            // The claim locks the end of the unpublished range, where every
            // new event is inserted...
            const completion = updateTask({ id: 'task-1', name: 'to complete', completed: true, correlationId: 'c' });
            expect(await stateAfter(completion, 500)).toBe('pending');

            // ...and the waiting completion keeps the whole todo_items table locked.
            const creation = db.storeItem({ id: 'task-2', name: 'new', completed: false });
            expect(await stateAfter(creation, 500)).toBe('pending');

            brokerAnswers.open();
            await expect(completion).resolves.toEqual({ id: 'task-1', name: 'to complete', completed: true });
            await expect(creation).resolves.toBeUndefined();
        } finally {
            brokerAnswers.open();
            await stop(relay);
        }
    });
});

describe('notifications worker', () => {
    async function selectRows(sql: string): Promise<RowDataPacket[]> {
        const [rows] = await connection.query<RowDataPacket[]>(sql);
        return rows;
    }

    test('applies a task.completed event once and recognises a redelivery', async () => {
        const event = taskCompleted('task-1');
        const before = Date.now();

        await expect(handleTaskEvent(event)).resolves.toBe('applied');
        await expect(handleTaskEvent(event)).resolves.toBe('duplicate');

        const notifications = await selectRows(
            'SELECT id, recipient_id, type, body, read_at, created_at FROM notifications',
        );
        expect(notifications).toEqual([
            {
                id: expect.stringMatching(/^[0-9a-f-]{36}$/),
                recipient_id: 'demo-user',
                type: TASK_COMPLETED,
                body: 'Task "Task task-1" moved to Done',
                read_at: null,
                created_at: expect.any(Date),
            },
        ]);
        expect(notifications[0].created_at.getTime()).toBeGreaterThanOrEqual(before);
        expect(notifications[0].created_at.getTime()).toBeLessThanOrEqual(Date.now());

        const processed = await selectRows('SELECT event_id, handler, processed_at FROM processed_events');
        expect(processed).toEqual([{ event_id: event.eventId, handler: HANDLER_NAME, processed_at: expect.any(Date) }]);
        expect(processed[0].processed_at.getTime()).toBeGreaterThanOrEqual(before);
        expect(processed[0].processed_at.getTime()).toBeLessThanOrEqual(Date.now());
    });

    test('addresses the notification to the actor when there is one', async () => {
        await handleTaskEvent(taskCompleted('task-1', 'user-7'));

        expect(await selectRows('SELECT recipient_id FROM notifications')).toEqual([{ recipient_id: 'user-7' }]);
    });

    test('lets any other database error through, so that the message is retried, and writes nothing', async () => {
        // event_id is CHAR(36): the idempotency insert fails, and not as a duplicate.
        const event = { ...taskCompleted('task-1'), eventId: 'x'.repeat(37) };

        await expect(handleTaskEvent(event)).rejects.toHaveProperty('code', 'ER_DATA_TOO_LONG');

        expect(await countRows(connection, 'notifications')).toBe(0);
        expect(await countRows(connection, 'processed_events')).toBe(0);
    });

    test('ignores other event types and writes nothing', async () => {
        const event = { ...taskCompleted('task-1'), type: 'task.renamed' };

        await expect(handleTaskEvent(event)).resolves.toBe('ignored');

        expect(await countRows(connection, 'notifications')).toBe(0);
        expect(await countRows(connection, 'processed_events')).toBe(0);
    });

    test('current behaviour, to be fixed: completing a task without a text name emits an event the worker rejects on every delivery', async () => {
        await insertTodoRows(connection, [['task-1', null, 0]]);
        // What PUT /items/:id passes on for an item whose name is NULL.
        await updateTask({ id: 'task-1', name: null as unknown as string, completed: true, correlationId: 'c' });
        const [pending] = await withTransaction(tx => claimBatch(tx, 10));
        expect(pending.envelope.payload).toMatchObject({ name: null });

        // The consumer requeues on any handler error, until the queue's
        // delivery limit dead-letters the message.
        await expect(handleTaskEvent(pending.envelope)).rejects.toBeInstanceOf(ZodError);
        await expect(handleTaskEvent(pending.envelope)).rejects.toBeInstanceOf(ZodError);

        expect(await countRows(connection, 'notifications')).toBe(0);
        expect(await countRows(connection, 'processed_events')).toBe(0);
    });
});
