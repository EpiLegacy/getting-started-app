import type { EventEnvelope } from './envelope';

/**
 * Port: the application layer depends on this interface, never on amqplib.
 * Tests inject an in-memory implementation; production injects the RabbitMQ
 * adapter; swapping brokers touches one file.
 */
export interface EventPublisher {
    publish(event: EventEnvelope): Promise<void>;
    close(): Promise<void>;
}
