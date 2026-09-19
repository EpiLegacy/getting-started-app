const express = require('express');
const path = require('path');
const app = express();
const db = require('./persistence');
const getItems = require('./routes/getItems');
const addItem = require('./routes/addItem');
const updateItem = require('./routes/updateItem');
const deleteItem = require('./routes/deleteItem');
import { closePool, ensureEventSchema, isMysqlConfigured } from './infrastructure/db/mysql';
import { init as initDrizzlePool } from './infrastructure/db/drizzle';
import { RabbitmqPublisher } from './infrastructure/messaging/rabbitmqPublisher';
import { startOutboxRelay, type RunningRelay } from './infrastructure/outbox/relay';
import { startOutboxRelay as startOutboxRelayDrizzle } from './infrastructure/outbox/relay.drizzle';
import { resolvePersistenceDriver } from './shared/persistenceDriver';

app.use(express.json());
app.use(express.static(path.join(__dirname, '../dist')));

app.get('/items', getItems);
app.post('/items', addItem);
app.put('/items/:id', updateItem);
app.delete('/items/:id', deleteItem);

// Let React Router handle direct visits to any frontend route.
app.get('/{*splat}', (_req: unknown, res: { sendFile: (file: string) => void }) => {
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

db.init()
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
