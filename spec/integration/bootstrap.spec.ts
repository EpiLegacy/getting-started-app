import type { Connection, RowDataPacket } from 'mysql2/promise';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import path from 'node:path';
import { connect } from './support/database';

let connection: Connection;
beforeAll(async () => { connection = await connect(); });
afterAll(async () => { await connection?.end(); });

test('shared setup applies the complete migration journal without suite-specific DDL', async () => {
    const migrations = readMigrationFiles({ migrationsFolder: path.join(__dirname, '../../drizzle') });
    const [applied] = await connection.query<RowDataPacket[]>('SELECT hash FROM __drizzle_migrations ORDER BY id');
    expect(applied.map(row => row.hash)).toEqual(migrations.map(migration => migration.hash));
    // Exercise the auth and ownership schema that application startup cannot create.
    await connection.query('SELECT task_key, user_id, deadline, priorisation FROM todo_items LIMIT 0');
    await connection.query('SELECT id FROM users LIMIT 0');
    await connection.query('SELECT id FROM sessions LIMIT 0');
});
