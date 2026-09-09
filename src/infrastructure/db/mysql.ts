import mysql, { type Pool, type PoolConnection } from 'mysql2/promise';

/**
 * Pool dedicated to the event-driven path.
 *
 * Separate from src/persistence/mysql.ts on purpose: that legacy adapter has no
 * transaction API, and the outbox pattern is meaningless without one. Both
 * disappear into a single Prisma client once the domain model lands.
 */
let pool: Pool | undefined;

export function isMysqlConfigured(): boolean {
    return Boolean(process.env.MYSQL_HOST);
}

export function getPool(): Pool {
    if (!pool) {
        pool = mysql.createPool({
            host: process.env.MYSQL_HOST,
            user: process.env.MYSQL_USER,
            password: process.env.MYSQL_PASSWORD,
            database: process.env.MYSQL_DB,
            connectionLimit: 5,
            charset: 'utf8mb4',
            // Dates are read and written as UTC, never as the container's
            // local time.
            timezone: 'Z',
        });
    }
    return pool;
}

export async function closePool(): Promise<void> {
    if (pool) {
        await pool.end();
        pool = undefined;
    }
}

/** Runs `fn` inside a single transaction, rolling back on any throw. */
export async function withTransaction<T>(
    fn: (connection: PoolConnection) => Promise<T>,
): Promise<T> {
    const connection = await getPool().getConnection();
    try {
        await connection.beginTransaction();
        const result = await fn(connection);
        await connection.commit();
        return result;
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}

/**
 * Schema for the event-driven tables. Hand-written CREATE TABLE mirrors what
 * the existing persistence layer already does; it is replaced by versioned
 * migrations when Prisma arrives.
 */
export async function ensureEventSchema(): Promise<void> {
    const p = getPool();

    await p.query(`
        CREATE TABLE IF NOT EXISTS outbox_events (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            event_id CHAR(36) NOT NULL UNIQUE,
            type VARCHAR(120) NOT NULL,
            version INT UNSIGNED NOT NULL,
            aggregate_id VARCHAR(64) NOT NULL,
            correlation_id VARCHAR(64) NOT NULL,
            actor_id VARCHAR(64) NULL,
            occurred_at DATETIME(3) NOT NULL,
            payload JSON NOT NULL,
            published_at DATETIME(3) NULL,
            INDEX idx_outbox_unpublished (published_at, id)
        ) DEFAULT CHARSET utf8mb4
    `);

    await p.query(`
        CREATE TABLE IF NOT EXISTS notifications (
            id CHAR(36) NOT NULL PRIMARY KEY,
            recipient_id VARCHAR(64) NOT NULL,
            type VARCHAR(120) NOT NULL,
            body VARCHAR(500) NOT NULL,
            read_at DATETIME(3) NULL,
            created_at DATETIME(3) NOT NULL,
            INDEX idx_notifications_recipient (recipient_id, created_at)
        ) DEFAULT CHARSET utf8mb4
    `);

    // Idempotency ledger: RabbitMQ guarantees at-least-once delivery, so a
    // handler must be able to recognise an event it has already applied.
    await p.query(`
        CREATE TABLE IF NOT EXISTS processed_events (
            event_id CHAR(36) NOT NULL,
            handler VARCHAR(120) NOT NULL,
            processed_at DATETIME(3) NOT NULL,
            PRIMARY KEY (event_id, handler)
        ) DEFAULT CHARSET utf8mb4
    `);
}
