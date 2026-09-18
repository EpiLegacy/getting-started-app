import { transaction } from '../db/drizzle';
import { claimBatch, markPublished } from './outboxRepository.drizzle';
import type { RelayOptions, RunningRelay } from './relay';
import type { EventPublisher } from '../../shared/events/publisher';

/**
 * Drizzle counterpart of relay.ts, selected by PERSISTENCE_DRIVER=drizzle
 * (see src/index.ts). Identical polling loop and guarantees — publishing
 * happens inside the claiming transaction, so delivery stays at-least-once
 * for the same reason the legacy relay is: see relay.ts for the full
 * rationale. Duplicated rather than shared because the two claim/publish
 * calls below are the only actual difference; lot 5 removes one of the two
 * relays entirely instead of introducing an abstraction only one lot needs.
 */
export function startOutboxRelay(publisher: EventPublisher, options: RelayOptions = {}): RunningRelay {
    const intervalMs = options.intervalMs ?? 1000;
    const batchSize = options.batchSize ?? 50;

    let stopped = false;
    let timer: NodeJS.Timeout | undefined;

    const tick = async (): Promise<void> => {
        try {
            await transaction(async tx => {
                const pending = await claimBatch(tx, batchSize);
                if (pending.length === 0) return;

                for (const event of pending) {
                    await publisher.publish(event.envelope);
                }
                await markPublished(
                    tx,
                    pending.map(event => event.id),
                );

                console.log(`[outbox] published ${pending.length} event(s)`);
            });
        } catch (error) {
            // Never let the loop die: the batch stays unpublished and the next
            // tick retries it.
            const reason = error instanceof Error ? error.message : String(error);
            console.error(`[outbox] relay tick failed: ${reason}`);
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
