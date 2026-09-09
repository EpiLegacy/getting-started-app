import { connect, type Channel, type ChannelModel, type ConsumeMessage } from 'amqplib';
import { closePool, ensureEventSchema } from '../../infrastructure/db/mysql';
import { rabbitmqUrl } from '../../infrastructure/messaging/rabbitmqPublisher';
import { assertTopology, NOTIFICATIONS_QUEUE } from '../../infrastructure/messaging/topology';
import { eventEnvelopeSchema } from '../../shared/events/envelope';
import { handleTaskEvent } from './handler';

const PREFETCH = 10;

/**
 * Standalone consumer process. Same image as the API, different command: the
 * two share the event schemas, so their contract cannot drift.
 */
async function main(): Promise<void> {
    await ensureEventSchema();

    // The whole consumer setup lives in the recovery hook, which amqplib runs
    // after EVERY successful connection. A channel belongs to the connection
    // that created it, so a broker restart would otherwise leave this process
    // alive but subscribed to nothing - a silent zombie, worse than a crash.
    const model = await connect(rabbitmqUrl(), {
        recovery: {
            setup: async (connected: ChannelModel) => {
                const channel = await connected.createChannel();
                await assertTopology(channel);

                // Bounded in-flight work: without it a single consumer would
                // pull the whole queue into memory and lose it all on a crash.
                await channel.prefetch(PREFETCH);

                await channel.consume(NOTIFICATIONS_QUEUE, (message: ConsumeMessage | null) => {
                    if (!message) return;
                    void onMessage(channel, message);
                });

                console.log(`[worker] consuming ${NOTIFICATIONS_QUEUE}`);
            },
        },
    });

    model.on('connect', () => console.log('[worker] connected to rabbitmq'));
    model.on('disconnect', (error: Error) =>
        console.error(`[worker] disconnected from rabbitmq: ${error.message}`),
    );
    model.on('error', (error: Error) => console.error(`[worker] rabbitmq: ${error.message}`));

    const shutdown = async (): Promise<void> => {
        try {
            await model.close();
            await closePool();
        } finally {
            process.exit(0);
        }
    };
    process.on('SIGINT', () => void shutdown());
    process.on('SIGTERM', () => void shutdown());
}

async function onMessage(channel: Channel, message: ConsumeMessage): Promise<void> {
    // Malformed or off-contract: retrying can never help, so such a message
    // goes straight to the dead-letter queue.
    let body: unknown;
    try {
        body = JSON.parse(message.content.toString());
    } catch {
        console.error('[worker] rejected a message that is not valid JSON');
        channel.nack(message, false, false);
        return;
    }

    const parsed = eventEnvelopeSchema.safeParse(body);
    if (!parsed.success) {
        const reasons = parsed.error.issues
            .map(issue => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
            .join('; ');
        console.error(`[worker] rejected an off-contract message -> ${reasons}`);
        channel.nack(message, false, false);
        return;
    }
    const envelope = parsed.data;

    try {
        const outcome = await handleTaskEvent(envelope);
        console.log(`[worker] ${envelope.type} ${envelope.eventId} -> ${outcome}`);
        channel.ack(message);
    } catch (error) {
        // Transient failure (database down, deadlock...): requeue. The queue's
        // x-delivery-limit dead-letters it after 5 attempts.
        console.error(`[worker] handling failed for ${envelope.eventId}`, error);
        channel.nack(message, false, true);
    }
}

main().catch((error: unknown) => {
    console.error('[worker] fatal', error);
    process.exit(1);
});
