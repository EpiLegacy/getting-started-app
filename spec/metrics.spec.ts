import express from 'express';
import request from 'supertest';
import { createMetrics } from '../src/infrastructure/metrics';
import { createApp } from '../src/app';

test('exposes process metrics without authentication and isolates registries', async () => {
    for (const app of [createApp(undefined, false), createApp(undefined, false)]) {
        const response = await request(app).get('/metrics');
        expect(response.status).toBe(200);
        expect(response.headers['content-type']).toContain('text/plain');
        expect(response.headers['cache-control']).toBe('no-store');
        expect(response.text).toContain('process_cpu_user_seconds_total');
        expect(response.text).toContain('process_resident_memory_bytes');
        expect(response.text).toContain('nodejs_eventloop_lag_seconds');
        expect(response.text).not.toContain('http_requests_total{');
        expect((await request(app).get('/metrics/missing').accept('html')).status).toBe(404);
    }
});

test('counts requests with route templates, durations and final error statuses', async () => {
    const metrics = createMetrics();
    const app = express().use(metrics.instrument).use(express.json());
    const router = express.Router();
    router.get('/:id', (_req, res) => { res.json({ ok: true }); });
    router.post('/:id', () => { throw new Error('test failure'); });
    app.use('/items', router);
    app.get('/metrics', metrics.expose);
    app.get('/health', (_req, res) => { res.sendStatus(200); });
    app.use((_err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
        res.sendStatus(500);
    });
    await request(app).get('/items/123?email=private@example.com');
    await request(app).get('/items/456');
    await request(app).post('/items/123');
    await request(app).get('/health');
    await request(app).get('/metrics');
    const { text } = await request(app).get('/metrics');
    expect(text).toContain('http_requests_total{method="GET",route="/items/:id",status="200"} 2');
    expect(text).toContain('http_requests_total{method="POST",route="/items/:id",status="500"} 1');
    expect(text).toContain('http_request_duration_seconds_count{method="GET",route="/items/:id",status="200"} 2');
    expect(text).toContain('http_request_duration_seconds_bucket{');
    expect(text).not.toMatch(/\/123|\/456|private@example|route="\/health"|route="\/metrics"/);
});

test('counts early middleware responses without leaking arbitrary paths', async () => {
    const app = createApp(undefined, false);
    await request(app).get('/items/private-id');
    await request(app).post('/items/another-id').set('Content-Type', 'application/json').send('{');
    const { text } = await request(app).get('/metrics');
    expect(text).toContain('http_requests_total{method="GET",route="/items/*",status="503"} 1');
    expect(text).toContain('http_requests_total{method="POST",route="/items/*",status="400"} 1');
    expect(text).not.toMatch(/private-id|another-id/);
});
