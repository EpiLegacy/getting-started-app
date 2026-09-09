import { randomUUID } from 'node:crypto';
import { withTransaction } from '../../infrastructure/db/mysql';
import type { EventEnvelope } from '../../shared/events/envelope';
import { TASK_COMPLETED, taskCompletedPayloadSchema } from '../../shared/events/catalog';

export const HANDLER_NAME = 'notifications';

export type HandlerOutcome = 'applied' | 'duplicate' | 'ignored';

/**
 * Placeholder recipient: notifications are addressed to the actor, and until
 * authentication lands there is no user id to carry. Replaced by the project
 * members once User/Project exist.
 */
const FALLBACK_RECIPIENT = 'demo-user';

export async function handleTaskEvent(envelope: EventEnvelope): Promise<HandlerOutcome> {
    if (envelope.type !== TASK_COMPLETED) return 'ignored';

    const payload = taskCompletedPayloadSchema.parse(envelope.payload);

    return withTransaction(async connection => {
        // The idempotency marker and the side effect share one transaction:
        // they are applied together or not at all. A redelivered event hits the
        // primary key and is skipped instead of creating a second notification.
        try {
            await connection.execute(
                'INSERT INTO processed_events (event_id, handler, processed_at) VALUES (?, ?, ?)',
                [envelope.eventId, HANDLER_NAME, new Date()],
            );
        } catch (error) {
            if ((error as { code?: string }).code === 'ER_DUP_ENTRY') return 'duplicate';
            throw error;
        }

        await connection.execute(
            `INSERT INTO notifications (id, recipient_id, type, body, created_at)
             VALUES (?, ?, ?, ?, ?)`,
            [
                randomUUID(),
                envelope.actorId ?? FALLBACK_RECIPIENT,
                envelope.type,
                `Task "${payload.name}" moved to Done`,
                new Date(),
            ],
        );

        return 'applied';
    });
}
