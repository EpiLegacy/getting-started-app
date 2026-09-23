import { createApp } from './app';
import db from './persistence';
import { closePool, ensureEventSchema, isMysqlConfigured } from './infrastructure/db/mysql';
import { init as initDrizzlePool, isDrizzleConfigured, teardown as closeDrizzlePool } from './infrastructure/db/drizzle';
import { RabbitmqPublisher } from './infrastructure/messaging/rabbitmqPublisher';
import { startOutboxRelay, type RunningRelay } from './infrastructure/outbox/relay';
import { startOutboxRelay as startOutboxRelayDrizzle } from './infrastructure/outbox/relay.drizzle';
import { resolvePersistenceDriver } from './shared/persistenceDriver';
import { drizzleAuthRepository } from './modules/auth/repository.drizzle';
import { createAuthService } from './modules/auth/service';

const authService = isDrizzleConfigured() ? createAuthService(drizzleAuthRepository) : undefined;
const app = createApp(authService,
    process.env.NODE_ENV === 'production' && process.env.SESSION_COOKIE_SECURE !== 'false');

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
    Promise.allSettled([publisher?.close(), closePool(), db.teardown().then(closeDrizzlePool)]).then(() =>
        process.exit(),
    );
};

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);
process.on('SIGUSR2', gracefulShutdown); // Sent by nodemon
