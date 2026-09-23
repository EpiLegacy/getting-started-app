import path from 'path';
import express, { type Express } from 'express';
import { isDrizzleConfigured } from '../../../src/infrastructure/db/drizzle';
import { drizzleAuthRepository } from '../../../src/modules/auth/repository.drizzle';
import { createAuthRouter } from '../../../src/modules/auth/routes';
import { createAuthService } from '../../../src/modules/auth/service';

/**
 * The Express application as src/index.ts wires it. src/index.ts itself cannot
 * be loaded by a test: loading it listens on port 3000 and connects to
 * RabbitMQ. items.spec.ts fails if the two wirings drift apart.
 *
 * The production image sets NODE_ENV=production, which decides what an error
 * response contains. Jest runs with NODE_ENV=test, hence the explicit setting.
 */
export function createApp(): Express {
    const app = express();
    app.set('env', 'production');

    app.use(express.json());
    app.use(express.static(path.join(__dirname, '../../../dist')));
    // The Drizzle pool must be initialised before the first /auth request.
    app.use(
        '/auth',
        createAuthRouter(isDrizzleConfigured() ? createAuthService(drizzleAuthRepository) : undefined, {
            secureCookies: false,
        }),
    );

    app.get('/items', require('../../../src/routes/getItems'));
    app.post('/items', require('../../../src/routes/addItem'));
    app.put('/items/:id', require('../../../src/routes/updateItem'));
    app.delete('/items/:id', require('../../../src/routes/deleteItem'));

    return app;
}
