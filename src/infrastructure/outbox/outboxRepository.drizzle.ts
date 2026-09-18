import { asc, inArray, isNull } from 'drizzle-orm';
import type { DrizzleTx } from '../db/drizzle';
import { outboxEvents } from '../db/schema';
import type { EventEnvelope } from '../../shared/events/envelope';
import type { PendingEvent } from './outboxRepository';

/**
 * Drizzle counterpart of outboxRepository.ts, selected by
 * PERSISTENCE_DRIVER=drizzle (see src/routes/updateItem.ts,
 * src/infrastructure/outbox/relay.drizzle.ts). Same guarantees: the event is
 * written in the caller's transaction (enqueue), and claimBatch locks with
 * `FOR UPDATE SKIP LOCKED` so concurrent relays never claim the same row.
 */

/** Writes the event in the SAME transaction as the state change it describes. */
export async function enqueue(tx: DrizzleTx, event: EventEnvelope): Promise<void> {
    await tx.insert(outboxEvents).values({
        eventId: event.eventId,
        type: event.type,
        version: event.version,
        aggregateId: event.aggregateId,
        correlationId: event.correlationId,
        actorId: event.actorId,
        occurredAt: new Date(event.occurredAt),
        payload: event.payload,
    });
}

/** Claims a batch of unpublished events. `limit` must be a positive integer. */
export async function claimBatch(tx: DrizzleTx, limit: number): Promise<PendingEvent[]> {
    if (!Number.isInteger(limit) || limit < 0) {
        throw new RangeError(`claimBatch: limit must be a non-negative integer, got ${limit}`);
    }

    const rows = await tx
        .select()
        .from(outboxEvents)
        .where(isNull(outboxEvents.publishedAt))
        .orderBy(asc(outboxEvents.id))
        .limit(limit)
        .for('update', { skipLocked: true });

    return rows.map(row => ({
        id: row.id,
        envelope: {
            eventId: row.eventId,
            type: row.type,
            version: row.version,
            occurredAt: row.occurredAt.toISOString(),
            correlationId: row.correlationId,
            actorId: row.actorId,
            aggregateId: row.aggregateId,
            payload: row.payload,
        },
    }));
}

export async function markPublished(tx: DrizzleTx, ids: number[]): Promise<void> {
    if (ids.length === 0) return;
    await tx.update(outboxEvents).set({ publishedAt: new Date() }).where(inArray(outboxEvents.id, ids));
}
