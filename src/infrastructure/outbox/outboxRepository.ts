import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import type { EventEnvelope } from '../../shared/events/envelope';

interface OutboxRow extends RowDataPacket {
    id: number;
    event_id: string;
    type: string;
    version: number;
    aggregate_id: string;
    correlation_id: string;
    actor_id: string | null;
    occurred_at: Date;
    payload: unknown;
}

export interface PendingEvent {
    id: number;
    envelope: EventEnvelope;
}

/**
 * Writes the event in the SAME transaction as the state change it describes.
 *
 * This is the whole point of the outbox: committing the row and publishing to
 * the broker are not atomic, so a crash between the two would leave the system
 * changed with no event emitted. Here, either both happen or neither does.
 */
export async function enqueue(
    connection: PoolConnection,
    event: EventEnvelope,
): Promise<void> {
    await connection.execute(
        `INSERT INTO outbox_events
            (event_id, type, version, aggregate_id, correlation_id, actor_id, occurred_at, payload)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            event.eventId,
            event.type,
            event.version,
            event.aggregateId,
            event.correlationId,
            event.actorId,
            new Date(event.occurredAt),
            JSON.stringify(event.payload),
        ],
    );
}

/**
 * Claims a batch of unpublished events.
 *
 * FOR UPDATE SKIP LOCKED lets several relay instances run side by side: each
 * one locks its own rows and skips those already claimed, so no event is
 * published twice by concurrent relays.
 */
export async function claimBatch(
    connection: PoolConnection,
    limit: number,
): Promise<PendingEvent[]> {
    const [rows] = await connection.query<OutboxRow[]>(
        `SELECT id, event_id, type, version, aggregate_id, correlation_id,
                actor_id, occurred_at, payload
           FROM outbox_events
          WHERE published_at IS NULL
          ORDER BY id
          LIMIT ${Number(limit)}
          FOR UPDATE SKIP LOCKED`,
    );

    return rows.map(row => ({
        id: row.id,
        envelope: {
            eventId: row.event_id,
            type: row.type,
            version: row.version,
            occurredAt: new Date(row.occurred_at).toISOString(),
            correlationId: row.correlation_id,
            actorId: row.actor_id,
            aggregateId: row.aggregate_id,
            // mysql2 already decodes JSON columns; a string means an older
            // server returned it raw.
            payload: typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload,
        },
    }));
}

export async function markPublished(
    connection: PoolConnection,
    ids: number[],
): Promise<void> {
    if (ids.length === 0) return;
    await connection.query(
        `UPDATE outbox_events SET published_at = ? WHERE id IN (${ids.map(() => '?').join(',')})`,
        [new Date(), ...ids],
    );
}
