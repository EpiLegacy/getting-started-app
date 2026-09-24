import path from 'node:path';
import mysql, { type RowDataPacket } from 'mysql2/promise';
import { drizzle } from 'drizzle-orm/mysql2';
import { migrate } from 'drizzle-orm/mysql2/migrator';
import './guard';

/** Each suite gets a fresh, fully migrated schema, including after DDL tests. */
export default async function prepareDatabase(): Promise<void> {
    const connection = await mysql.createConnection({
        host: process.env.MYSQL_HOST,
        port: process.env.MYSQL_PORT ? Number(process.env.MYSQL_PORT) : undefined,
        user: process.env.MYSQL_USER,
        password: process.env.MYSQL_PASSWORD,
        charset: 'utf8mb4',
        timezone: 'Z',
    });
    try {
        await connection.query(
            'CREATE DATABASE IF NOT EXISTS ?? CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci',
            [process.env.MYSQL_DB],
        );
        await connection.changeUser({ database: process.env.MYSQL_DB });
        // Migration tests deliberately drop/alter tables without updating the
        // journal. Reset both together rather than trusting that stale journal.
        const [tables] = await connection.query<RowDataPacket[]>('SHOW FULL TABLES WHERE Table_type = "BASE TABLE"');
        await connection.query('SET FOREIGN_KEY_CHECKS = 0');
        try {
            for (const table of tables) {
                await connection.query('DROP TABLE ??', [Object.values(table)[0]]);
            }
        } finally {
            await connection.query('SET FOREIGN_KEY_CHECKS = 1');
        }
        await migrate(drizzle(connection), { migrationsFolder: path.join(__dirname, '../../../drizzle') });
    } finally {
        await connection.end();
    }
}
