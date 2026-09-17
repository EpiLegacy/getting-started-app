import { readFileSync } from 'node:fs';
import mysql, { type Pool } from 'mysql2/promise';
import { drizzle, type MySql2Database } from 'drizzle-orm/mysql2';
import waitPort from 'wait-port';
import * as schema from './schema';

/**
 * The single MySQL pool for PERSISTENCE_DRIVER=drizzle, shared by the
 * `Persistence` implementation (src/persistence/drizzle.ts) and the outbox
 * (once lot 4 lands). Replaces having one pool per legacy adapter
 * (src/persistence/mysql.ts, src/infrastructure/db/mysql.ts) with one.
 *
 * Never runs a migration or a `CREATE TABLE`: schema changes are applied out
 * of band with `npm run db:migrate` (see drizzle/README.md), and this module
 * only connects to whatever schema is already there.
 */

type Db = MySql2Database<typeof schema>;

let pool: Pool | undefined;
let db: Db | undefined;

/** Same *_FILE convention as the legacy adapters: value as read, no trim. */
function env(name: string): string | undefined {
    const file = process.env[`${name}_FILE`];
    return file ? readFileSync(file, 'utf8') : process.env[name];
}

export function isDrizzleConfigured(): boolean {
    return Boolean(env('MYSQL_HOST'));
}

export async function init(): Promise<void> {
    const host = env('MYSQL_HOST');
    const port = env('MYSQL_PORT') ? Number(env('MYSQL_PORT')) : 3306;

    await waitPort({
        host,
        port,
        timeout: 10000,
        waitForDns: true,
    });

    pool = mysql.createPool({
        host,
        port,
        user: env('MYSQL_USER'),
        password: env('MYSQL_PASSWORD'),
        database: env('MYSQL_DB'),
        connectionLimit: 5,
        charset: 'utf8mb4',
        // Dates are read and written as UTC, never as the container's local
        // time — matches src/infrastructure/db/mysql.ts.
        timezone: 'Z',
    });
    db = drizzle(pool, { schema, mode: 'default' });

    console.log(`Connected to mysql db at host ${host} (drizzle)`);
}

export function getDb(): Db {
    if (!db) throw new Error('Drizzle pool not initialised: call init() first');
    return db;
}

export async function teardown(): Promise<void> {
    if (pool) {
        await pool.end();
        pool = undefined;
        db = undefined;
    }
}

/**
 * Drizzle wraps every driver failure in its own `DrizzleQueryError`, with the
 * raw mysql2 error (`.code`, `.errno`, `.sqlMessage`) moved to `.cause`. The
 * legacy adapters throw that raw error directly, and callers rely on its
 * shape — src/workers/notifications/handler.ts checks
 * `error.code === 'ER_DUP_ENTRY'` for idempotency, and the routes let
 * Express's default handler turn any thrown error into a generic 500.
 * Unwrapping here keeps that contract identical for callers of drizzle code.
 */
export async function unwrapErrors<T>(fn: () => Promise<T>): Promise<T> {
    try {
        return await fn();
    } catch (error) {
        if (error instanceof Error && error.cause instanceof Error) throw error.cause;
        throw error;
    }
}
