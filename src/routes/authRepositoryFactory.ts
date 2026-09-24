/**
 * authRepositoryFactory — resolves the correct UserRepository implementation
 * for the active persistence backend (SQLite in dev, MySQL in prod).
 *
 * This mirrors the pattern in src/persistence/index.ts which selects the
 * persistence adapter at runtime based on MYSQL_HOST.
 *
 * Kept in src/routes/ as a thin wiring file because:
 *   - The auth module itself must not import from infrastructure/db
 *     (that would couple domain to infra).
 *   - The router (which IS infrastructure) is the right place to compose.
 *   - When Drizzle lands, only this file changes.
 */

import type { UserRepository } from '../modules/auth/infrastructure/userRepository';
import {
    makeSqliteUserRepository,
    makeMysqlUserRepository,
} from '../modules/auth/infrastructure/userRepository';

let repo: UserRepository | undefined;

/**
 * Returns the singleton UserRepository for the active DB backend.
 * Must be called after the persistence layer has initialised.
 */
export function getUserRepository(): UserRepository {
    if (repo) return repo;

    if (process.env.MYSQL_HOST) {
        // Reuse the infrastructure pool to avoid opening a second connection pool.
        const { getPool } = require('../infrastructure/db/mysql') as {
            getPool: () => import('mysql2/promise').Pool;
        };
        repo = makeMysqlUserRepository(getPool());
    } else {
        // SQLite: open the same database file the persistence layer uses.
        const sqlite3 = require('sqlite3').verbose() as typeof import('sqlite3');
        const location =
            process.env.SQLITE_DB_LOCATION ??
            require('path').resolve('data', 'todo.db');
        // The file already exists by the time this is called (db.init() ran).
        const db = new sqlite3.Database(location);
        repo = makeSqliteUserRepository(db);
    }

    return repo;
}
