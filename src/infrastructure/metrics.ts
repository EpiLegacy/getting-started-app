import type { RequestHandler } from 'express';
import { collectDefaultMetrics, Counter, Histogram, Registry } from '@prometheus-io/client';

/** Each app owns a registry so tests and multiple app instances stay isolated. */
export function createMetrics() {
    const registry = new Registry();
    collectDefaultMetrics({ register: registry });
    const labelNames = ['method', 'route', 'status'] as const;
    const requests = new Counter({
        name: 'http_requests_total',
        help: 'Completed auth and task API requests.',
        labelNames,
        registers: [registry],
    });
    const duration = new Histogram({
        name: 'http_request_duration_seconds',
        help: 'Auth and task API response duration in seconds.',
        labelNames,
        buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
        registers: [registry],
    });
    const instrument: RequestHandler = (req, res, next) => {
        // Only fixed API prefixes: never label metrics with IDs or query strings.
        const prefix = /^\/(auth|items)(?:\/|$)/.exec(req.path)?.[1];
        if (prefix) {
            const started = process.hrtime.bigint();
            res.once('finish', () => {
                const template: unknown = req.route?.path;
                // Middleware (including auth and JSON parsing) can respond before
                // a route is matched. Group those responses into a bounded label.
                const route = typeof template === 'string' && template !== '/{*path}'
                    ? `/${prefix}${template === '/' ? '' : template}`
                    : `/${prefix}/*`;
                const method = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].includes(req.method)
                    ? req.method : 'OTHER';
                const labels = { method, route, status: String(res.statusCode) };
                requests.inc(labels);
                duration.observe(labels, Number(process.hrtime.bigint() - started) / 1e9);
            });
        }
        next();
    };
    const expose: RequestHandler = async (_req, res) => {
        res.set('Cache-Control', 'no-store');
        res.set('Content-Type', registry.contentType);
        res.send(await registry.metrics());
    };
    return { instrument, expose };
}
