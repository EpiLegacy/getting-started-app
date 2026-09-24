/**
 * UserRepository — raw SQL data-access for the `users` table.
 *
 * Intentionally written as a plain interface + two concrete adapters (SQLite
 * and MySQL) so the application layer depends only on the interface. When
 * Drizzle ORM lands, replace each adapter with a Drizzle implementation and
 * export the same interface — zero changes required in application use-cases.
 *
 * Column map (matches the CREATE TABLE in ensureAuthSchema):
 *   id            VARCHAR(36)  – uuid v4
 *   email         VARCHAR(255) – unique, normalised to lowercase
 *   password_hash VARCHAR(255) – Argon2id output
 *   created_at    DATETIME(3)  – ISO-8601 UTC
 */

import type { Database } from 'sqlite3';
import type { Pool } from 'mysql2/promise';

// ---------------------------------------------------------------------------
// Domain type
// ---------------------------------------------------------------------------

export interface UserRecord {
    id: string;
    email: string;
    password_hash: string;
    created_at: string;
}

// ---------------------------------------------------------------------------
// Repository interface (Drizzle-swap-ready)
// ---------------------------------------------------------------------------

export interface UserRepository {
    /** Returns the user with the given email, or undefined if not found. */
    findByEmail(email: string): Promise<UserRecord | undefined>;
    /** Inserts a new user row. Throws on duplicate email. */
    insert(user: UserRecord): Promise<void>;
}

// ---------------------------------------------------------------------------
// SQLite adapter
// ---------------------------------------------------------------------------

interface SqliteRow {
    id: string;
    email: string;
    password_hash: string;
    created_at: string;
}

export function makeSqliteUserRepository(db: Database): UserRepository {
    return {
        findByEmail(email: string): Promise<UserRecord | undefined> {
            return new Promise((resolve, reject) => {
                db.all(
                    'SELECT id, email, password_hash, created_at FROM users WHERE email = ?',
                    [email],
                    (err: Error | null, rows: SqliteRow[]) => {
                        if (err) return reject(err);
                        resolve(rows[0]);
                    },
                );
            });
        },

        insert(user: UserRecord): Promise<void> {
            return new Promise((resolve, reject) => {
                db.run(
                    'INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)',
                    [user.id, user.email, user.password_hash, user.created_at],
                    (err: Error | null) => {
                        if (err) return reject(err);
                        resolve();
                    },
                );
            });
        },
    };
}

// ---------------------------------------------------------------------------
// MySQL adapter
// ---------------------------------------------------------------------------

import type { RowDataPacket } from 'mysql2/promise';

interface MysqlRow extends RowDataPacket {
    id: string;
    email: string;
    password_hash: string;
    created_at: string | Date;
}

export function makeMysqlUserRepository(pool: Pool): UserRepository {
    return {
        async findByEmail(email: string): Promise<UserRecord | undefined> {
            const [rows] = await pool.query<MysqlRow[]>(
                'SELECT id, email, password_hash, created_at FROM users WHERE email = ?',
                [email],
            );
            const row = rows[0];
            if (!row) return undefined;
            return {
                id: row.id,
                email: row.email,
                password_hash: row.password_hash,
                created_at:
                    row.created_at instanceof Date
                        ? row.created_at.toISOString()
                        : String(row.created_at),
            };
        },

        async insert(user: UserRecord): Promise<void> {
            await pool.query(
                'INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)',
                [user.id, user.email, user.password_hash, new Date(user.created_at)],
            );
        },
    };
}
