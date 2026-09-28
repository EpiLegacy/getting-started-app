import type { Channel, ConsumeMessage } from 'amqplib';
import { eventEnvelopeSchema, type EventEnvelope } from '../../shared/events/envelope';
import type { HandlerOutcome } from './handler';
import type { MessageOutcome, WorkerMetrics } from './metrics';

export function createMessageProcessor(
    handle: (envelope: EventEnvelope) => Promise<HandlerOutcome>,
    metrics: WorkerMetrics,
) {
    return async (channel: Pick<Channel, 'ack' | 'nack'>, message: ConsumeMessage): Promise<void> => {
        const finish = metrics.startMessage();
        let outcome: MessageOutcome = 'failed';
        try {
            // Invalid messages cannot succeed on retry: send them to the DLQ.
            let body: unknown;
            try {
                body = JSON.parse(message.content.toString());
            } catch {
                console.error('[worker] rejected a message that is not valid JSON');
                channel.nack(message, false, false);
                outcome = 'rejected';
                return;
            }
            const parsed = eventEnvelopeSchema.safeParse(body);
            if (!parsed.success) {
                const reasons = parsed.error.issues
                    .map(issue => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
                    .join('; ');
                console.error(`[worker] rejected an off-contract message -> ${reasons}`);
                channel.nack(message, false, false);
                outcome = 'rejected';
                return;
            }
            const envelope = parsed.data;
            try {
                const result = await handle(envelope);
                console.log(`[worker] ${envelope.type} ${envelope.eventId} -> ${result}`);
                channel.ack(message);
                outcome = result;
            } catch (error) {
                // Preserve retries; RabbitMQ dead-letters after the delivery limit.
                console.error(`[worker] handling failed for ${envelope.eventId}`, error);
                channel.nack(message, false, true);
            }
        } finally {
            finish(outcome);
        }
    };
}
