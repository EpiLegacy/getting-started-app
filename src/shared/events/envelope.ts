import { randomUUID } from 'node:crypto';
import { z } from 'zod';

/**
 * Every event on the bus carries the same envelope. Only `payload` varies,
 * and its shape is described per event type in the catalog.
 */
export const eventEnvelopeSchema = z.object({
    // Idempotency key: a consumer uses it to detect a redelivery.
    eventId: z.uuid(),
    // Routing key on the topic exchange, e.g. "task.completed".
    type: z.string().min(1),
    // Bumped when the payload shape changes in a breaking way.
    version: z.number().int().positive(),
    occurredAt: z.iso.datetime(),
    // Propagated from the inbound HTTP request, so one user action can be
    // followed across the API, the broker and the worker.
    correlationId: z.string().min(1),
    // Null for events emitted by the system rather than by a user.
    actorId: z.string().min(1).nullable(),
    aggregateId: z.string().min(1),
    payload: z.unknown(),
});

export type EventEnvelope<TPayload = unknown> = Omit<
    z.infer<typeof eventEnvelopeSchema>,
    'payload'
> & { payload: TPayload };

export function createEvent<TPayload>(input: {
    type: string;
    version: number;
    aggregateId: string;
    payload: TPayload;
    correlationId: string;
    actorId?: string | null;
}): EventEnvelope<TPayload> {
    return {
        eventId: randomUUID(),
        type: input.type,
        version: input.version,
        occurredAt: new Date().toISOString(),
        correlationId: input.correlationId,
        actorId: input.actorId ?? null,
        aggregateId: input.aggregateId,
        payload: input.payload,
    };
}
