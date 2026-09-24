/**
 * ensureAuthSchema — idempotent DDL for the `users` table.
 *
 * Called once during server startup after the primary persistence layer has
 * initialised. Uses the same DB connection strategy as the rest of the app:
 *   - MySQL if MYSQL_HOST is set
 *   - SQLite otherwise
 *
 * Column notes:
 *   id            VARCHAR(36)  – UUID v4 as a string (no binary type, for
 *                                portability and Drizzle compatibility)
 *   email         VARCHAR(255) – normalised to lowercase before storage
 *   password_hash VARCHAR(255) – Argon2id output is ≤128 chars in practice;
 *                                255 gives room for algorithm upgrades
 *   created_at    DATETIME(3)  – millisecond precision UTC timestamp
 */

export async function ensureAuthSchema(): Promise<void> {
    if (process.env.MYSQL_HOST) {
        // Same file — use a relative sibling import.
        const { getPool } = await import('./mysql');
        const pool = getPool();
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id            VARCHAR(36)  NOT NULL PRIMARY KEY,
                email         VARCHAR(255) NOT NULL UNIQUE,
                password_hash VARCHAR(255) NOT NULL,
                created_at    DATETIME(3)  NOT NULL,
                INDEX idx_users_email (email)
            ) DEFAULT CHARSET utf8mb4
        `);
    } else {
        // SQLite path — open the same DB file the todo persistence layer uses.
        const sqlite3 = (require('sqlite3') as typeof import('sqlite3')).verbose();
        const path = require('path') as typeof import('path');
        const location =
            process.env.SQLITE_DB_LOCATION ?? path.resolve('data', 'todo.db');

        await new Promise<void>((resolve, reject) => {
            const db = new sqlite3.Database(location, err => {
                if (err) return reject(err);

                db.run(
                    `CREATE TABLE IF NOT EXISTS users (
                        id            VARCHAR(36)  NOT NULL PRIMARY KEY,
                        email         VARCHAR(255) NOT NULL UNIQUE,
                        password_hash VARCHAR(255) NOT NULL,
                        created_at    DATETIME(3)  NOT NULL
                    )`,
                    (runErr: Error | null) => {
                        db.close();
                        if (runErr) return reject(runErr);
                        resolve();
                    },
                );
            });
        });
    }
}
