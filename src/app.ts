import express from 'express';
import path from 'path';
import { createAuthRouter } from './modules/auth/routes';
import type { AuthService } from './modules/auth/service';
import { createTaskRouter } from './modules/tasks/routes';
import { taskRepository } from './modules/tasks/repository.drizzle';
import { createMetrics } from './infrastructure/metrics';

/** Shared by production and HTTP integration tests; creates no connections. */
export function createApp(authService: AuthService | undefined, secureCookies: boolean) {
    const app = express();
    const metrics = createMetrics();
    app.use(metrics.instrument);
    app.get('/metrics', metrics.expose);
    app.use(express.json());
    // Liveness for the Docker HEALTHCHECK and the CI smoke test. The server only
    // listens once persistence and eventing have started, so any answer means
    // start-up succeeded. Anonymous and free of I/O on purpose: a probe must
    // neither need an account nor fail because MySQL is slow for a moment.
    app.get('/health', (_req: unknown, res: { json: (body: unknown) => void }) => res.json({ status: 'ok' }));
    app.use(express.static(path.join(__dirname, '../dist')));
    app.use('/auth', createAuthRouter(authService, { secureCookies }));

    app.use('/items', createTaskRouter(authService, taskRepository));

    // Serve the single-page application when a frontend route is opened directly.
    app.get('/{*path}', (req, res, next) => {
        // Preserve API and asset 404s instead of responding with the HTML shell.
        if (/^\/(items|auth|health|metrics|assets)(\/|$)/.test(req.path) || path.extname(req.path) || !req.accepts('html')) {
            next();
            return;
        }
        res.sendFile(path.join(__dirname, '../dist/index.html'));
    });

    return app;
}
