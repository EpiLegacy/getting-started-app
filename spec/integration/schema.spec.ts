import type { Connection } from 'mysql2/promise';
import { closePool, ensureEventSchema } from '../../src/infrastructure/db/mysql';
import { TABLES, connect, dropTables, showCreateTable } from './support/database';

/*
 * The tables the application creates at start-up must be the ones production
 * has: every other integration test relies on it, and so will the Drizzle
 * schema. Reference: scripts/db/inspect.sql run against production on
 * 2026-09-17 (MySQL 8.4.11), AUTO_INCREMENT counters left out.
 */
const PRODUCTION = {
    todo_items:
        'CREATE TABLE `todo_items` ( `id` varchar(36) DEFAULT NULL, `name` varchar(255) DEFAULT NULL, ' +
        '`completed` tinyint(1) DEFAULT NULL ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci',
    outbox_events:
        'CREATE TABLE `outbox_events` ( `id` bigint unsigned NOT NULL AUTO_INCREMENT, ' +
        '`event_id` char(36) NOT NULL, `type` varchar(120) NOT NULL, `version` int unsigned NOT NULL, ' +
        '`aggregate_id` varchar(64) NOT NULL, `correlation_id` varchar(64) NOT NULL, ' +
        '`actor_id` varchar(64) DEFAULT NULL, `occurred_at` datetime(3) NOT NULL, `payload` json NOT NULL, ' +
        '`published_at` datetime(3) DEFAULT NULL, PRIMARY KEY (`id`), UNIQUE KEY `event_id` (`event_id`), ' +
        'KEY `idx_outbox_unpublished` (`published_at`,`id`) ) ' +
        'ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci',
    notifications:
        'CREATE TABLE `notifications` ( `id` char(36) NOT NULL, `recipient_id` varchar(64) NOT NULL, ' +
        '`type` varchar(120) NOT NULL, `body` varchar(500) NOT NULL, `read_at` datetime(3) DEFAULT NULL, ' +
        '`created_at` datetime(3) NOT NULL, PRIMARY KEY (`id`), ' +
        'KEY `idx_notifications_recipient` (`recipient_id`,`created_at`) ) ' +
        'ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci',
    processed_events:
        'CREATE TABLE `processed_events` ( `event_id` char(36) NOT NULL, `handler` varchar(120) NOT NULL, ' +
        '`processed_at` datetime(3) NOT NULL, PRIMARY KEY (`event_id`,`handler`) ) ' +
        'ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci',
};

const db = require('../../src/persistence');
// Mirrors src/persistence/index.ts's own default.
const driver = process.env.PERSISTENCE_DRIVER === 'drizzle' ? 'drizzle' : 'legacy';
let connection: Connection;

beforeAll(async () => {
    connection = await connect();
});

/**
 * Both tests below need todo_items to exist beforehand. On
 * PERSISTENCE_DRIVER=drizzle only a migration creates it — never
 * src/index.ts itself (ADR 0001: no migration at start-up) — so it is
 * created here, through the verification connection directly, never through
 * the application under test.
 */
beforeEach(async () => {
    await connection.query(
        'CREATE TABLE IF NOT EXISTS todo_items (id varchar(36), name varchar(255), completed boolean) DEFAULT CHARSET utf8mb4',
    );
});

afterAll(async () => {
    await connection?.end();
    await closePool();
    await db.teardown();
});

(driver === 'legacy' ? test : test.skip)(
    'start-up creates the tables exactly as production has them',
    async () => {
        // Test database only (checked by connect): start from nothing.
        await dropTables(connection);

        // Start-up order of src/index.ts.
        await db.init();
        await ensureEventSchema();

        for (const table of TABLES) {
            expect(await showCreateTable(connection, table)).toBe(PRODUCTION[table as keyof typeof PRODUCTION]);
        }
    },
);

(driver === 'drizzle' ? test : test.skip)(
    'start-up never runs a migration',
    async () => {
        await dropTables(connection, ['todo_items']);

        await db.init();

        // No CREATE TABLE ran: the column the other tests rely on is still gone.
        await expect(connection.query('SELECT 1 FROM todo_items')).rejects.toThrow(/doesn't exist/);
    },
);

test('a restart leaves existing tables and their rows alone', async () => {
    await connection.execute('INSERT INTO todo_items (id, name, completed) VALUES (?, ?, ?)', ['kept', 'kept', 1]);
    await connection.execute('INSERT INTO processed_events (event_id, handler, processed_at) VALUES (?, ?, ?)', [
        '00000000-0000-4000-8000-000000000000',
        'notifications',
        new Date('2026-09-17T08:00:00.123Z'),
    ]);

    // Shutdown then start-up, as src/index.ts does them.
    await db.teardown();
    await closePool();
    await db.init();
    await ensureEventSchema();

    const [items] = await connection.query('SELECT id, name, completed FROM todo_items');
    expect(items).toEqual([{ id: 'kept', name: 'kept', completed: 1 }]);
    const [processed] = await connection.query('SELECT event_id, handler, processed_at FROM processed_events');
    expect(processed).toEqual([
        {
            event_id: '00000000-0000-4000-8000-000000000000',
            handler: 'notifications',
            processed_at: new Date('2026-09-17T08:00:00.123Z'),
        },
    ]);
    for (const table of TABLES) {
        expect(await showCreateTable(connection, table)).toBe(PRODUCTION[table as keyof typeof PRODUCTION]);
    }
});
