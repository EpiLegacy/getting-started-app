import mysql, { type Connection, type RowDataPacket } from 'mysql2/promise';
import { TEST_DATABASE_NAME } from './guard';

/** Every table the application writes to. */
export const TABLES = ['todo_items', 'outbox_events', 'notifications', 'processed_events'];

export interface TodoRow {
    id: string | null;
    name: string | null;
    completed: number | null;
}

export interface OutboxRow {
    id: number;
    event_id: string;
    type: string;
    version: number;
    aggregate_id: string;
    correlation_id: string;
    actor_id: string | null;
    occurred_at: Date;
    payload: unknown;
    published_at: Date | null;
}

/**
 * A connection of its own, independent from the code under test: it arranges
 * rows and reads what was actually committed.
 */
export async function connect(): Promise<Connection> {
    const connection = await mysql.createConnection({
        host: process.env.MYSQL_HOST,
        port: process.env.MYSQL_PORT ? Number(process.env.MYSQL_PORT) : undefined,
        user: process.env.MYSQL_USER,
        password: process.env.MYSQL_PASSWORD,
        database: process.env.MYSQL_DB,
        charset: 'utf8mb4',
        timezone: 'Z',
    });

    // The guard checked the variable; this checks the server's answer.
    const [rows] = await connection.query<RowDataPacket[]>('SELECT DATABASE() AS name');
    const name = String(rows[0]?.name);
    if (!TEST_DATABASE_NAME.test(name)) {
        await connection.end();
        throw new Error(`Refusing to use database "${name}": its name does not end with "_test".`);
    }
    return connection;
}

/** Empties application tables. Only ever reached on a "_test" database. */
export async function emptyTables(connection: Connection, tables: string[] = TABLES): Promise<void> {
    for (const table of tables) {
        await connection.query('DELETE FROM ??', [table]);
    }
}

/** Drops application tables. Only ever reached on a "_test" database. */
export async function dropTables(connection: Connection, tables: string[] = TABLES): Promise<void> {
    for (const table of tables) {
        await connection.query('DROP TABLE IF EXISTS ??', [table]);
    }
}

/** SHOW CREATE TABLE on one line, without the AUTO_INCREMENT counter. */
export async function showCreateTable(connection: Connection, table: string): Promise<string> {
    const [rows] = await connection.query<RowDataPacket[]>('SHOW CREATE TABLE ??', [table]);
    return String(rows[0]['Create Table'])
        .replace(/\s*\r?\n\s*/g, ' ')
        .replace(/ AUTO_INCREMENT=\d+/, '');
}

/**
 * Inserts rows the way they can exist in production: todo_items has no primary
 * key and no NOT NULL constraint, so ids repeat and any column can be NULL.
 */
export async function insertTodoRows(
    connection: Connection,
    rows: Array<[string | null, string | null, number | null]>,
): Promise<void> {
    for (const row of rows) {
        await connection.execute('INSERT INTO todo_items (id, name, completed) VALUES (?, ?, ?)', row);
    }
}

/** No ORDER BY, like the application: InnoDB returns them in insertion order. */
export async function selectTodoRows(connection: Connection): Promise<TodoRow[]> {
    const [rows] = await connection.query<RowDataPacket[]>('SELECT id, name, completed FROM todo_items');
    return rows.map(row => ({ id: row.id, name: row.name, completed: row.completed }));
}

/** The bytes MySQL stores for a name, as uppercase hexadecimal. */
export async function selectNameBytes(connection: Connection, id: string): Promise<string[]> {
    const [rows] = await connection.execute<RowDataPacket[]>(
        'SELECT HEX(name) AS hex FROM todo_items WHERE id = ?',
        [id],
    );
    return rows.map(row => String(row.hex));
}

export async function selectOutboxRows(connection: Connection): Promise<OutboxRow[]> {
    const [rows] = await connection.query<RowDataPacket[]>('SELECT * FROM outbox_events ORDER BY id');
    return rows as OutboxRow[];
}

export async function countRows(connection: Connection, table: string): Promise<number> {
    const [rows] = await connection.query<RowDataPacket[]>('SELECT COUNT(*) AS n FROM ??', [table]);
    return Number(rows[0].n);
}

export async function countUnpublished(connection: Connection): Promise<number> {
    const [rows] = await connection.query<RowDataPacket[]>(
        'SELECT COUNT(*) AS n FROM outbox_events WHERE published_at IS NULL',
    );
    return Number(rows[0].n);
}
