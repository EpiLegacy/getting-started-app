/**
 * One-shot merge of the legacy SQLite database into MySQL, with zero data loss.
 *
 *   node build/scripts/mergeSqliteIntoMysql/index.js            # dry run (default)
 *   node build/scripts/mergeSqliteIntoMysql/index.js --apply    # performs the merge
 *
 * Options:
 *   --sqlite <path>       SQLite file (default: $SQLITE_DB_LOCATION or /etc/todos/todo.db)
 *   --mysql-port <port>   MySQL port (default: 3306)
 *   --backup-dir <dir>    Where the SQLite copy goes (default: next to the file)
 *   --report <path>       JSON report (default: ./merge-report-<timestamp>.json)
 *
 * Guarantees:
 *   - SQLite is opened read-only and is never modified; a copy is taken before --apply.
 *   - No existing MySQL row is updated or deleted.
 *   - Any row that cannot be inserted as-is goes to `todo_items_merge_conflicts`.
 *   - Before committing, the script re-reads MySQL and rolls back if a single
 *     SQLite row is unaccounted for.
 *   - Idempotent: running it again inserts nothing and records nothing twice.
 *
 * MySQL connection uses the same variables as the app (MYSQL_HOST, MYSQL_USER,
 * MYSQL_PASSWORD, MYSQL_DB and their *_FILE variants).
 */
import fs from 'fs';
import path from 'path';
import mysql, { type Connection, type RowDataPacket } from 'mysql2/promise';
import sqlite3 from 'sqlite3';
import { findUnaccountedRows, planMerge, serializeRawRow, type MergePlan, type RawRow } from './plan';

interface Options {
    apply: boolean;
    sqlitePath: string;
    mysqlPort: number;
    backupDir?: string;
    reportPath: string;
}

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

function parseArgs(argv: string[]): Options {
    const value = (flag: string): string | undefined => {
        const index = argv.indexOf(flag);
        if (index === -1) return undefined;
        const next = argv[index + 1];
        if (!next || next.startsWith('--')) throw new Error(`${flag} expects a value`);
        return next;
    };

    return {
        apply: argv.includes('--apply'),
        sqlitePath: value('--sqlite') ?? process.env.SQLITE_DB_LOCATION ?? '/etc/todos/todo.db',
        mysqlPort: Number(value('--mysql-port') ?? 3306),
        backupDir: value('--backup-dir'),
        reportPath: value('--report') ?? path.resolve(`merge-report-${timestamp}.json`),
    };
}

/** Same resolution as src/persistence/mysql.ts, so the script sees the same database. */
function env(name: string): string | undefined {
    const file = process.env[`${name}_FILE`];
    return file ? fs.readFileSync(file).toString() : process.env[name];
}

function readSqlite(file: string): Promise<RawRow[]> {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(file, sqlite3.OPEN_READONLY, err => {
            if (err) return reject(err);
            db.all('SELECT id, name, completed FROM todo_items', (queryErr, rows: RawRow[]) => {
                db.close();
                if (queryErr) return reject(queryErr);
                resolve(rows);
            });
        });
    });
}

function backupSqlite(file: string, backupDir: string | undefined): string {
    const dir = backupDir ?? path.dirname(file);
    fs.mkdirSync(dir, { recursive: true });
    const target = path.join(dir, `${path.basename(file)}.backup-${timestamp}`);
    // COPYFILE_EXCL: never overwrite an earlier backup.
    fs.copyFileSync(file, target, fs.constants.COPYFILE_EXCL);
    for (const suffix of ['-wal', '-shm', '-journal']) {
        if (fs.existsSync(file + suffix)) {
            fs.copyFileSync(file + suffix, target + suffix, fs.constants.COPYFILE_EXCL);
        }
    }
    if (fs.statSync(target).size !== fs.statSync(file).size) {
        throw new Error(`Backup ${target} does not match the original size`);
    }
    return target;
}

async function tableExists(connection: Connection, table: string): Promise<boolean> {
    const [rows] = await connection.query<RowDataPacket[]>(
        'SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?',
        [table],
    );
    return rows.length > 0;
}

async function ensureTables(connection: Connection): Promise<void> {
    // Identical to the legacy adapter: the app keeps working unchanged.
    await connection.query(
        'CREATE TABLE IF NOT EXISTS todo_items (id varchar(36), name varchar(255), completed boolean) DEFAULT CHARSET utf8mb4',
    );
    await connection.query(`
        CREATE TABLE IF NOT EXISTS todo_items_merge_conflicts (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            row_hash CHAR(64) NOT NULL UNIQUE,
            reason VARCHAR(64) NOT NULL,
            item_id VARCHAR(255) NULL,
            sqlite_row LONGTEXT NOT NULL,
            mysql_rows LONGTEXT NOT NULL,
            detected_at DATETIME(3) NOT NULL,
            resolved_at DATETIME(3) NULL
        ) DEFAULT CHARSET utf8mb4
    `);
}

async function readMysqlItems(connection: Connection, lock: boolean): Promise<RawRow[]> {
    const [rows] = await connection.query<RowDataPacket[]>(
        `SELECT id, name, completed FROM todo_items${lock ? ' FOR UPDATE' : ''}`,
    );
    return rows as RawRow[];
}

function summary(plan: MergePlan): Record<string, number> {
    const byReason: Record<string, number> = {};
    for (const conflict of plan.conflicts) {
        byReason[`conflicts.${conflict.reason}`] = (byReason[`conflicts.${conflict.reason}`] ?? 0) + 1;
    }
    return {
        sqliteRows: plan.sqliteRowCount,
        mysqlRowsBefore: plan.mysqlRowCount,
        alreadyPresent: plan.alreadyPresent,
        exactDuplicatesInSqlite: plan.exactDuplicatesInSqlite,
        toInsert: plan.toInsert.length,
        conflicts: plan.conflicts.length,
        ...byReason,
    };
}

async function main(): Promise<void> {
    const options = parseArgs(process.argv.slice(2));

    if (!fs.existsSync(options.sqlitePath)) {
        throw new Error(`SQLite file not found: ${options.sqlitePath}`);
    }
    const host = env('MYSQL_HOST');
    if (!host) throw new Error('MYSQL_HOST (or MYSQL_HOST_FILE) is required');

    console.log(`Mode: ${options.apply ? 'APPLY' : 'DRY RUN (nothing will be written)'}`);

    let backupPath: string | undefined;
    if (options.apply) {
        backupPath = backupSqlite(options.sqlitePath, options.backupDir);
        console.log(`SQLite backup: ${backupPath}`);
    }

    const sqliteRows = await readSqlite(options.sqlitePath);

    const connection = await mysql.createConnection({
        host,
        port: options.mysqlPort,
        user: env('MYSQL_USER'),
        password: env('MYSQL_PASSWORD'),
        database: env('MYSQL_DB'),
        charset: 'utf8mb4',
        supportBigNumbers: true,
    });

    let plan: MergePlan;
    try {
        if (options.apply) {
            // DDL commits implicitly in MySQL: it must run before the transaction.
            await ensureTables(connection);
        }

        await connection.beginTransaction();
        try {
            const hasItems = await tableExists(connection, 'todo_items');
            // FOR UPDATE on a table without an index locks every row and gap:
            // no concurrent write can slip in between the read and the commit.
            const mysqlRows = hasItems ? await readMysqlItems(connection, options.apply) : [];
            plan = planMerge(sqliteRows, mysqlRows);

            if (!options.apply) {
                await connection.rollback();
            } else {
                for (const row of plan.toInsert) {
                    await connection.execute(
                        'INSERT INTO todo_items (id, name, completed) VALUES (?, ?, ?)',
                        [row.id, row.name, row.completed],
                    );
                }
                for (const conflict of plan.conflicts) {
                    await connection.execute(
                        `INSERT IGNORE INTO todo_items_merge_conflicts
                            (row_hash, reason, item_id, sqlite_row, mysql_rows, detected_at)
                         VALUES (?, ?, ?, ?, ?, ?)`,
                        [
                            conflict.hash,
                            conflict.reason,
                            conflict.itemId,
                            serializeRawRow(conflict.sqliteRow),
                            JSON.stringify(conflict.mysqlRows),
                            new Date(),
                        ],
                    );
                }

                const mysqlAfter = await readMysqlItems(connection, true);
                const [hashRows] = await connection.query<RowDataPacket[]>(
                    'SELECT row_hash FROM todo_items_merge_conflicts',
                );
                const hashes = new Set(hashRows.map(r => String(r.row_hash)));
                const missing = findUnaccountedRows(sqliteRows, mysqlAfter, hashes);
                if (missing.length > 0) {
                    throw new Error(
                        `Verification failed, rolling back: ${missing.length} SQLite row(s) unaccounted for: ` +
                            missing.slice(0, 5).map(serializeRawRow).join(', '),
                    );
                }
                if (mysqlAfter.length < plan.mysqlRowCount) {
                    throw new Error('Verification failed, rolling back: MySQL lost rows during the merge');
                }

                await connection.commit();
            }
        } catch (error) {
            await connection.rollback();
            throw error;
        }
    } finally {
        await connection.end();
    }

    const report = {
        mode: options.apply ? 'apply' : 'dry-run',
        sqlitePath: options.sqlitePath,
        backupPath,
        summary: summary(plan),
        conflicts: plan.conflicts.map(c => ({
            reason: c.reason,
            itemId: c.itemId,
            sqliteRow: JSON.parse(serializeRawRow(c.sqliteRow)),
            mysqlRows: c.mysqlRows,
        })),
    };
    fs.writeFileSync(options.reportPath, JSON.stringify(report, null, 2), { flag: 'wx' });

    console.table(report.summary);
    console.log(`Report: ${options.reportPath}`);
    if (options.apply && plan.conflicts.length > 0) {
        console.log('Conflicts were kept in todo_items_merge_conflicts for manual review.');
    }
}

main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
});
