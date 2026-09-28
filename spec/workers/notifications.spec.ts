import type { ConsumeMessage } from 'amqplib';
import request from 'supertest';
import { createEvent } from '../../src/shared/events/envelope';
import { createMessageProcessor } from '../../src/workers/notifications/consumer';
import { createWorkerMetrics } from '../../src/workers/notifications/metrics';
import type { HandlerOutcome } from '../../src/workers/notifications/handler';

const event = createEvent({
    type: 'task.completed', version: 1, aggregateId: 'private-task-id',
    correlationId: 'private-correlation-id', actorId: 'private-user-id', payload: {},
});
const delivery = (body: string = JSON.stringify(event)) => ({ content: Buffer.from(body) }) as ConsumeMessage;
const channel = () => ({ ack: jest.fn(), nack: jest.fn() });

beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

test('metrics remain available while readiness follows consumer state', async () => {
    const metrics = createWorkerMetrics();
    expect((await request(metrics.app).get('/health')).status).toBe(503);
    expect((await request(metrics.app).get('/metrics')).text).toContain('notification_worker_consuming 0');
    metrics.setConsuming(true);
    expect((await request(metrics.app).get('/health')).status).toBe(200);
    metrics.setConsuming(false);
    expect((await request(metrics.app).get('/health')).status).toBe(503);
    const response = await request(metrics.app).get('/metrics');
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/plain');
    expect(response.text).toContain('process_resident_memory_bytes');
    expect(response.text).toContain('notification_worker_consuming 0');
});

test.each<HandlerOutcome>(['applied', 'duplicate', 'ignored'])('acknowledges and measures %s messages', async outcome => {
    const metrics = createWorkerMetrics();
    const handle = jest.fn().mockResolvedValue(outcome);
    const processMessage = createMessageProcessor(handle, metrics);
    const broker = channel();
    const message = delivery();
    await processMessage(broker, message);
    expect(handle).toHaveBeenCalledWith(event);
    expect(broker.ack).toHaveBeenCalledWith(message);
    expect(broker.nack).not.toHaveBeenCalled();
    const { text } = await request(metrics.app).get('/metrics');
    expect(text).toContain(`notification_worker_messages_total{outcome="${outcome}"} 1`);
    expect(text).toContain(`notification_worker_processing_duration_seconds_count{outcome="${outcome}"} 1`);
    expect(text).toContain('notification_worker_in_flight 0');
    expect(text).not.toMatch(/private-task-id|private-user-id|private-correlation-id/);
});

test.each(['{', '{}'])('dead-letters invalid input without calling the handler (%s)', async body => {
    const metrics = createWorkerMetrics();
    const handle = jest.fn();
    const broker = channel();
    const message = delivery(body);
    await createMessageProcessor(handle, metrics)(broker, message);
    expect(handle).not.toHaveBeenCalled();
    expect(broker.ack).not.toHaveBeenCalled();
    expect(broker.nack).toHaveBeenCalledWith(message, false, false);
    const { text } = await request(metrics.app).get('/metrics');
    expect(text).toContain('notification_worker_messages_total{outcome="rejected"} 1');
    expect(text).toContain('notification_worker_in_flight 0');
});

test('requeues failures and accounts for in-flight work while the handler is pending', async () => {
    const metrics = createWorkerMetrics();
    let fail!: (error: Error) => void;
    const handle = jest.fn(() => new Promise<HandlerOutcome>((_resolve, reject) => { fail = reject; }));
    const broker = channel();
    const message = delivery();
    const processing = createMessageProcessor(handle, metrics)(broker, message);
    expect((await request(metrics.app).get('/metrics')).text).toContain('notification_worker_in_flight 1');
    fail(new Error('database unavailable'));
    await processing;
    expect(broker.nack).toHaveBeenCalledWith(message, false, true);
    expect(broker.ack).not.toHaveBeenCalled();
    const { text } = await request(metrics.app).get('/metrics');
    expect(text).toContain('notification_worker_messages_total{outcome="failed"} 1');
    expect(text).toContain('notification_worker_in_flight 0');
});

test('records interrupted acknowledgements even when the channel has closed', async () => {
    const metrics = createWorkerMetrics();
    const broker = channel();
    broker.ack.mockImplementation(() => { throw new Error('channel closed'); });
    broker.nack.mockImplementation(() => { throw new Error('channel closed'); });
    await expect(createMessageProcessor(async () => 'applied', metrics)(broker, delivery())).rejects.toThrow('channel closed');
    const { text } = await request(metrics.app).get('/metrics');
    expect(text).toContain('notification_worker_messages_total{outcome="failed"} 1');
    expect(text).toContain('notification_worker_in_flight 0');
});
