import {
    connect,
    type ChannelModel,
    type ConfirmChannel,
    type RecoveringChannelModel,
} from 'amqplib';
import type { EventEnvelope } from '../../shared/events/envelope';
import type { EventPublisher } from '../../shared/events/publisher';
import { assertTopology, EXCHANGE } from './topology';

export function rabbitmqUrl(): string {
    return process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672';
}

/**
 * Bounds how long a publish may wait for the broker.
 *
 * The relay publishes inside its claiming transaction, so an unbounded wait
 * would hold database locks for as long as RabbitMQ stays down. Failing fast
 * releases them and the batch is simply retried on the next tick.
 */
const PUBLISH_TIMEOUT_MS = 10_000;

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    try {
        return await Promise.race([
            promise,
            new Promise<never>((_, reject) => {
                timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
            }),
        ]);
    } finally {
        if (timer) clearTimeout(timer);
    }
}

/**
 * Adapter for the EventPublisher port.
 *
 * Two properties matter here:
 *
 * - Confirm channel: publish() only resolves once the broker has acknowledged
 *   the message, so the relay never marks an event published that never left.
 * - Reconnection: amqplib restores the connection on its own, but a channel
 *   belongs to the connection that created it. A channel is therefore acquired
 *   lazily and dropped as soon as it errors or closes, so the next publish
 *   transparently gets a fresh one.
 */
export class RabbitmqPublisher implements EventPublisher {
    private channel: ConfirmChannel | undefined;

    private constructor(private readonly model: RecoveringChannelModel) {}

    static async create(url: string = rabbitmqUrl()): Promise<RabbitmqPublisher> {
        const model = await connect(url, {
            recovery: {
                // Runs after every successful connection: a broker that came
                // back empty gets its exchanges and queues re-declared.
                setup: async (connected: ChannelModel) => {
                    const channel = await connected.createChannel();
                    await assertTopology(channel);
                    await channel.close();
                },
            },
        });

        model.on('connect', () => console.log('[rabbitmq] connected'));
        model.on('disconnect', (error: Error) =>
            console.error(`[rabbitmq] disconnected: ${error.message}`),
        );
        // Without a listener amqplib would emit an unhandled 'error' event.
        model.on('error', (error: Error) => console.error(`[rabbitmq] ${error.message}`));

        return new RabbitmqPublisher(model);
    }

    private async acquireChannel(): Promise<ConfirmChannel> {
        if (this.channel) return this.channel;

        // Resolves once the recovering model holds a live connection.
        const channel = await this.model.createConfirmChannel();
        const forget = (): void => {
            if (this.channel === channel) this.channel = undefined;
        };
        channel.on('close', forget);
        channel.on('error', forget);

        this.channel = channel;
        return channel;
    }

    async publish(event: EventEnvelope): Promise<void> {
        try {
            const channel = await withTimeout(
                this.acquireChannel(),
                PUBLISH_TIMEOUT_MS,
                'acquiring a channel',
            );

            channel.publish(EXCHANGE, event.type, Buffer.from(JSON.stringify(event)), {
                // Survives a broker restart, together with the durable queue.
                persistent: true,
                contentType: 'application/json',
                messageId: event.eventId,
                correlationId: event.correlationId,
                type: event.type,
                timestamp: Date.parse(event.occurredAt),
            });

            await withTimeout(channel.waitForConfirms(), PUBLISH_TIMEOUT_MS, 'broker confirmation');
        } catch (error) {
            // The channel is suspect: drop it so the next attempt reconnects.
            this.channel = undefined;
            throw error;
        }
    }

    async close(): Promise<void> {
        await this.model.close();
    }
}
