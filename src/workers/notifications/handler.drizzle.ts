import { randomUUID } from 'node:crypto';
import { transaction, unwrapError } from '../../infrastructure/db/drizzle';
import { notifications, processedEvents } from '../../infrastructure/db/schema';
import type { EventEnvelope } from '../../shared/events/envelope';
import { TASK_COMPLETED, taskCompletedPayloadSchema } from '../../shared/events/catalog';
import { HANDLER_NAME, type HandlerOutcome } from './handler';

/**
 * Placeholder recipient: notifications are addressed to the actor, and until
 * authentication lands there is no user id to carry. Replaced by the project
 * members once User/Project exist. Duplicated from handler.ts, which uses
 * the same string.
 */
const FALLBACK_RECIPIENT = 'demo-user';

/**
 * Drizzle counterpart of handler.ts, selected by PERSISTENCE_DRIVER=drizzle
 * (see src/workers/notifications/index.ts). Same idempotency guarantee: the
 * processed_events insert and the notification share one transaction, and a
 * redelivered event hits the primary key instead of creating a second
 * notification.
 */
export async function handleTaskEvent(envelope: EventEnvelope): Promise<HandlerOutcome> {
    if (envelope.type !== TASK_COMPLETED) return 'ignored';

    const payload = taskCompletedPayloadSchema.parse(envelope.payload);

    return transaction(async tx => {
        try {
            await tx.insert(processedEvents).values({
                eventId: envelope.eventId,
                handler: HANDLER_NAME,
                processedAt: new Date(),
            });
        } catch (rawError) {
            // Caught inside the transaction, before transaction()'s own
            // unwrapErrors() ever sees it: drizzle wraps this one too.
            const error = unwrapError(rawError);
            if ((error as { code?: string }).code === 'ER_DUP_ENTRY') return 'duplicate';
            throw error;
        }

        await tx.insert(notifications).values({
            id: randomUUID(),
            recipientId: envelope.actorId ?? FALLBACK_RECIPIENT,
            type: envelope.type,
            body: `Task "${payload.name}" moved to Done`,
            createdAt: new Date(),
        });

        return 'applied';
    });
}
