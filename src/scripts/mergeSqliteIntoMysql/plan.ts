import { createHash } from 'crypto';

/**
 * Pure merge planning: no I/O here, so every rule about "which row goes where"
 * is unit-testable without a database.
 *
 * The one invariant this module guarantees: every SQLite row ends up either
 * (a) already present, identical, in MySQL, (b) inserted into MySQL, or
 * (c) written to the conflict table for a human to decide. Nothing is ever
 * overwritten, truncated or silently dropped.
 */

/** Limits of the legacy `todo_items` table: id varchar(36), name varchar(255). */
export const MAX_ID_LENGTH = 36;
export const MAX_NAME_LENGTH = 255;

export interface RawRow {
    id: unknown;
    name: unknown;
    completed: unknown;
}

export interface TodoRow {
    id: string;
    name: string | null;
    completed: 0 | 1 | null;
}

export type ConflictReason =
    /** id is NULL, empty, not text or longer than varchar(36). */
    | 'invalid_id'
    /** name is not text (e.g. a BLOB). */
    | 'invalid_name'
    /** name would be truncated by varchar(255). */
    | 'name_too_long'
    /** completed is something other than 0/1/true/false/NULL. */
    | 'invalid_completed'
    /** Same id exists in MySQL with a different name or completed value. */
    | 'differs_from_mysql'
    /** SQLite itself holds several different rows for the same id. */
    | 'duplicate_id_in_sqlite';

export interface Conflict {
    reason: ConflictReason;
    itemId: string | null;
    /** The SQLite row exactly as read. */
    sqliteRow: RawRow;
    /** What MySQL holds for that id, when relevant — kept for the reviewer. */
    mysqlRows: TodoRow[];
    /** Stable fingerprint: re-running the merge never records a conflict twice. */
    hash: string;
}

export interface MergePlan {
    toInsert: TodoRow[];
    conflicts: Conflict[];
    alreadyPresent: number;
    /** Byte-identical rows repeated inside SQLite (the table has no primary key). */
    exactDuplicatesInSqlite: number;
    sqliteRowCount: number;
    mysqlRowCount: number;
}

type Normalized = { ok: true; row: TodoRow } | { ok: false; reason: ConflictReason };

function codePointLength(value: string): number {
    // MySQL utf8mb4 counts characters, not UTF-16 units.
    return [...value].length;
}

export function normalizeCompleted(value: unknown): 0 | 1 | null | undefined {
    if (value === null || value === undefined) return null;
    if (value === 0 || value === false || value === '0' || value === 'false') return 0;
    if (value === 1 || value === true || value === '1' || value === 'true') return 1;
    if (typeof value === 'bigint' && (value === 0n || value === 1n)) return Number(value) as 0 | 1;
    return undefined;
}

export function normalizeRow(raw: RawRow): Normalized {
    const { id, name } = raw;

    if (typeof id !== 'string' || id.length === 0 || codePointLength(id) > MAX_ID_LENGTH) {
        return { ok: false, reason: 'invalid_id' };
    }

    let normalizedName: string | null;
    if (name === null || name === undefined) {
        normalizedName = null;
    } else if (typeof name === 'string') {
        normalizedName = name;
    } else if (typeof name === 'number' || typeof name === 'bigint') {
        // SQLite's TEXT affinity already stores numbers as text; MySQL would too.
        normalizedName = String(name);
    } else {
        return { ok: false, reason: 'invalid_name' };
    }
    if (normalizedName !== null && codePointLength(normalizedName) > MAX_NAME_LENGTH) {
        return { ok: false, reason: 'name_too_long' };
    }

    const completed = normalizeCompleted(raw.completed);
    if (completed === undefined) return { ok: false, reason: 'invalid_completed' };

    return { ok: true, row: { id, name: normalizedName, completed } };
}

export function rowKey(row: TodoRow): string {
    return JSON.stringify([row.id, row.name, row.completed]);
}

function serialize(value: unknown): string {
    return JSON.stringify(value, (_key, v) => {
        if (typeof v === 'bigint') return v.toString();
        if (v && typeof v === 'object' && (v as { type?: string }).type === 'Buffer') {
            return { buffer: Buffer.from((v as { data: number[] }).data).toString('base64') };
        }
        return v;
    });
}

export function serializeRawRow(row: RawRow): string {
    return serialize({ id: row.id, name: row.name, completed: row.completed });
}

/**
 * 'differs_from_mysql' and 'duplicate_id_in_sqlite' share one fingerprint: the
 * same row can be classified either way depending on what an earlier run
 * already inserted, and it must still be recorded only once.
 */
export function conflictHash(reason: ConflictReason, row: RawRow): string {
    const family = reason === 'differs_from_mysql' || reason === 'duplicate_id_in_sqlite' ? 'id_collision' : reason;
    return createHash('sha256').update(`${family}\n${serializeRawRow(row)}`).digest('hex');
}

export function planMerge(sqliteRaw: RawRow[], mysqlRaw: RawRow[]): MergePlan {
    const mysqlById = new Map<string, TodoRow[]>();
    for (const raw of mysqlRaw) {
        const normalized = normalizeRow(raw);
        // A MySQL row that does not normalize is left untouched: it is already
        // in the target database, so it cannot be lost by this script.
        if (!normalized.ok) continue;
        const list = mysqlById.get(normalized.row.id) ?? [];
        list.push(normalized.row);
        mysqlById.set(normalized.row.id, list);
    }

    const plan: MergePlan = {
        toInsert: [],
        conflicts: [],
        alreadyPresent: 0,
        exactDuplicatesInSqlite: 0,
        sqliteRowCount: sqliteRaw.length,
        mysqlRowCount: mysqlRaw.length,
    };

    const seenKeys = new Set<string>();
    const recordedConflicts = new Set<string>();
    const insertedIds = new Set<string>();

    const addConflict = (reason: ConflictReason, raw: RawRow, itemId: string | null, mysqlRows: TodoRow[]) => {
        const hash = conflictHash(reason, raw);
        if (recordedConflicts.has(hash)) return;
        recordedConflicts.add(hash);
        plan.conflicts.push({ reason, itemId, sqliteRow: raw, mysqlRows, hash });
    };

    for (const raw of sqliteRaw) {
        const normalized = normalizeRow(raw);
        if (!normalized.ok) {
            addConflict(normalized.reason, raw, typeof raw.id === 'string' ? raw.id : null, []);
            continue;
        }

        const row = normalized.row;
        const key = rowKey(row);
        if (seenKeys.has(key)) {
            plan.exactDuplicatesInSqlite++;
            continue;
        }
        seenKeys.add(key);

        const existing = mysqlById.get(row.id) ?? [];
        if (existing.some(candidate => rowKey(candidate) === key)) {
            plan.alreadyPresent++;
            continue;
        }

        if (existing.length === 0) {
            plan.toInsert.push(row);
            insertedIds.add(row.id);
            mysqlById.set(row.id, [row]);
            continue;
        }

        if (insertedIds.has(row.id)) {
            addConflict('duplicate_id_in_sqlite', raw, row.id, []);
        } else {
            addConflict('differs_from_mysql', raw, row.id, existing);
        }
    }

    return plan;
}

/**
 * Proves the invariant against the database state *after* the writes, inside
 * the same transaction: if any SQLite row is neither in MySQL nor recorded as
 * a conflict, the caller must roll back.
 */
export function findUnaccountedRows(
    sqliteRaw: RawRow[],
    mysqlRawAfter: RawRow[],
    conflictHashesAfter: Set<string>,
): RawRow[] {
    const mysqlKeys = new Set<string>();
    for (const raw of mysqlRawAfter) {
        const normalized = normalizeRow(raw);
        if (normalized.ok) mysqlKeys.add(rowKey(normalized.row));
    }

    return sqliteRaw.filter(raw => {
        const normalized = normalizeRow(raw);
        if (normalized.ok && mysqlKeys.has(rowKey(normalized.row))) return false;
        const reason: ConflictReason = normalized.ok ? 'differs_from_mysql' : normalized.reason;
        return !conflictHashesAfter.has(conflictHash(reason, raw));
    });
}
