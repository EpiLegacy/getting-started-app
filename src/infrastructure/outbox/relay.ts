import type { EventPublisher } from '../../shared/events/publisher';
import { withTransaction } from '../db/mysql';
import { claimBatch, markPublished } from './outboxRepository';

export interface RelayOptions {
    intervalMs?: number;
    batchSize?: number;
}

export interface RunningRelay {
    stop(): void;
}

/**
 * Polls the outbox and forwards events to the broker.
 *
 * Publishing happens inside the claiming transaction: rows stay locked until
 * the broker has confirmed, so a crash mid-batch rolls back and the events are
 * simply picked up again. That makes delivery at-least-once, which is exactly
 * why consumers must be idempotent.
 */
export function startOutboxRelay(
    publisher: EventPublisher,
    options: RelayOptions = {},
): RunningRelay {
    const intervalMs = options.intervalMs ?? 1000;
    const batchSize = options.batchSize ?? 50;

    let stopped = false;
    let timer: NodeJS.Timeout | undefined;

    const tick = async (): Promise<void> => {
        try {
            await withTransaction(async connection => {
                const pending = await claimBatch(connection, batchSize);
                if (pending.length === 0) return;

                for (const event of pending) {
                    await publisher.publish(event.envelope);
                }
                await markPublished(connection, pending.map(event => event.id));

                console.log(`[outbox] published ${pending.length} event(s)`);
            });
        } catch (error) {
            // Never let the loop die: the batch stays unpublished and the next
            // tick retries it.
            console.error('[outbox] relay tick failed', error);
        } finally {
            if (!stopped) timer = setTimeout(tick, intervalMs);
        }
    };

    void tick();

    return {
        stop(): void {
            stopped = true;
            if (timer) clearTimeout(timer);
        },
    };
}
