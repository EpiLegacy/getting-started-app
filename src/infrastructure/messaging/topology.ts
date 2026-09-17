import type { Channel } from 'amqplib';

export const EXCHANGE = 'kanban.events';
export const DEAD_LETTER_EXCHANGE = 'kanban.events.dlx';

export const NOTIFICATIONS_QUEUE = 'notifications.task-events';
export const NOTIFICATIONS_DLQ = 'notifications.task-events.dlq';

/** Every "task.*" event reaches the notifications consumer. */
export const TASK_PATTERN = 'task.*';

/**
 * Declared by both the publisher and the consumer: whichever starts first
 * creates the topology, and the declarations are idempotent.
 */
export async function assertTopology(channel: Channel): Promise<void> {
    await channel.assertExchange(EXCHANGE, 'topic', { durable: true });
    await channel.assertExchange(DEAD_LETTER_EXCHANGE, 'topic', { durable: true });

    // Poison messages land here instead of looping forever.
    await channel.assertQueue(NOTIFICATIONS_DLQ, { durable: true });
    await channel.bindQueue(NOTIFICATIONS_DLQ, DEAD_LETTER_EXCHANGE, '#');

    await channel.assertQueue(NOTIFICATIONS_QUEUE, {
        durable: true,
        arguments: {
            // Quorum queues support x-delivery-limit: after 5 failed deliveries
            // the broker itself dead-letters the message.
            'x-queue-type': 'quorum',
            'x-dead-letter-exchange': DEAD_LETTER_EXCHANGE,
            'x-delivery-limit': 5,
        },
    });
    await channel.bindQueue(NOTIFICATIONS_QUEUE, EXCHANGE, TASK_PATTERN);
}
