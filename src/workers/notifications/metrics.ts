import express from 'express';
import { collectDefaultMetrics, Counter, Gauge, Histogram, Registry } from '@prometheus-io/client';
import type { HandlerOutcome } from './handler';

export type MessageOutcome = HandlerOutcome | 'rejected' | 'failed';

export function createWorkerMetrics() {
    const registry = new Registry();
    collectDefaultMetrics({ register: registry });
    const messages = new Counter({
        name: 'notification_worker_messages_total',
        help: 'Message processing attempts by outcome; retries count as separate attempts.',
        labelNames: ['outcome'] as const,
        registers: [registry],
    });
    const duration = new Histogram({
        name: 'notification_worker_processing_duration_seconds',
        help: 'Time spent processing a message attempt, including validation and database work.',
        labelNames: ['outcome'] as const,
        buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
        registers: [registry],
    });
    const inFlight = new Gauge({
        name: 'notification_worker_in_flight',
        help: 'Message attempts currently being processed.',
        registers: [registry],
    });
    const consuming = new Gauge({
        name: 'notification_worker_consuming',
        help: '1 when the RabbitMQ consumer is registered; 0 during startup or disconnection.',
        registers: [registry],
    });
    let ready = false;
    consuming.set(0);
    inFlight.set(0);
    for (const outcome of ['applied', 'duplicate', 'ignored', 'rejected', 'failed'] as const) {
        messages.inc({ outcome }, 0);
    }
    const app = express();
    app.get('/metrics', async (_req, res) => {
        res.set('Cache-Control', 'no-store');
        res.set('Content-Type', registry.contentType);
        res.send(await registry.metrics());
    });
    app.get('/health', (_req, res) => {
        res.status(ready ? 200 : 503).json({ status: ready ? 'ok' : 'not_consuming' });
    });
    return {
        app,
        setConsuming(value: boolean) {
            ready = value;
            consuming.set(value ? 1 : 0);
        },
        startMessage() {
            inFlight.inc();
            const end = duration.startTimer();
            return (outcome: MessageOutcome) => {
                messages.inc({ outcome });
                end({ outcome });
                inFlight.dec();
            };
        },
    };
}

export type WorkerMetrics = ReturnType<typeof createWorkerMetrics>;
