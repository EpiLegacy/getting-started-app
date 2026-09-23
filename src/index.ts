import express from 'express';
import path from 'path';
const app = express();
import db from './persistence';
import getItems from './routes/getItems';
import addItem from './routes/addItem';
import updateItem from './routes/updateItem';
import deleteItem from './routes/deleteItem';
import { closePool, ensureEventSchema, isMysqlConfigured } from './infrastructure/db/mysql';
import { init as initDrizzlePool, isDrizzleConfigured } from './infrastructure/db/drizzle';
import { RabbitmqPublisher } from './infrastructure/messaging/rabbitmqPublisher';
import { startOutboxRelay, type RunningRelay } from './infrastructure/outbox/relay';
import { startOutboxRelay as startOutboxRelayDrizzle } from './infrastructure/outbox/relay.drizzle';
import { resolvePersistenceDriver } from './shared/persistenceDriver';
import { drizzleAuthRepository } from './modules/auth/repository.drizzle';
import { createAuthRouter } from './modules/auth/routes';
import { createAuthService } from './modules/auth/service';

// Accounts live in MySQL only (ADR 0001). The session cookie is Secure in the
// production image unless SESSION_COOKIE_SECURE=false, for a demo served over
// plain HTTP on something other than localhost.
const authRouter = createAuthRouter(
    isDrizzleConfigured() ? createAuthService(drizzleAuthRepository) : undefined,
    { secureCookies: process.env.NODE_ENV === 'production' && process.env.SESSION_COOKIE_SECURE !== 'false' },
);

app.use(express.json());
// Liveness for the Docker HEALTHCHECK and the CI smoke test. The server only
// listens once persistence and eventing have started, so any answer means
// start-up succeeded. Anonymous and free of I/O on purpose: a probe must
// neither need an account nor fail because MySQL is slow for a moment.
app.get('/health', (_req: unknown, res: { json: (body: unknown) => void }) => res.json({ status: 'ok' }));
app.use(express.static(path.join(__dirname, '../dist')));
app.use('/auth', authRouter);

app.get('/items', getItems);
app.post('/items', addItem);
app.put('/items/:id', updateItem);
app.delete('/items/:id', deleteItem);

// Serve the single-page application when a frontend route is opened directly.
app.get('/{*path}', (req, res, next) => {
    // Preserve API and asset 404s instead of responding with the HTML shell.
    if (/^\/(items|auth|health|assets)(\/|$)/.test(req.path) || path.extname(req.path) || !req.accepts('html')) {
        next();
        return;
    }
    res.sendFile(path.join(__dirname, '../dist/index.html'));
});

let relay: RunningRelay | undefined;
let publisher: RabbitmqPublisher | undefined;

// The outbox relay runs inside the API process for now. It moves to its own
// process the day a second API replica exists; FOR UPDATE SKIP LOCKED in the
// repository already makes that safe.
async function startEventing(): Promise<void> {
    if (!isMysqlConfigured()) {
        console.log('MYSQL_HOST is not set: running without the event-driven path');
        return;
    }
    await ensureEventSchema();
    publisher = await RabbitmqPublisher.create();
    if (resolvePersistenceDriver() === 'drizzle') {
        // Idempotent: already initialised by db.init() above when
        // PERSISTENCE_DRIVER=drizzle, so this only matters if that order
        // ever changes.
        await initDrizzlePool();
        relay = startOutboxRelayDrizzle(publisher);
    } else {
        relay = startOutboxRelay(publisher);
    }
    console.log('Outbox relay started');
}

// The auth repository uses the Drizzle pool whatever PERSISTENCE_DRIVER says.
async function startAuth(): Promise<void> {
    if (isDrizzleConfigured()) await initDrizzlePool();
}

db.init()
    .then(startAuth)
    .then(startEventing)
    .then(() => {
        app.listen(3000, () => console.log('Listening on port 3000'));
    })
    .catch((err: unknown) => {
        console.error(err);
        process.exit(1);
    });

const gracefulShutdown = (): void => {
    relay?.stop();
    Promise.allSettled([publisher?.close(), closePool(), db.teardown()]).then(() =>
        process.exit(),
    );
};

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);
process.on('SIGUSR2', gracefulShutdown); // Sent by nodemon
