import {
    MAX_NAME_LENGTH,
    conflictHash,
    findUnaccountedRows,
    planMerge,
    type RawRow,
} from '../../src/scripts/mergeSqliteIntoMysql/plan';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';

const hashesOf = (plan: ReturnType<typeof planMerge>) => new Set(plan.conflicts.map(c => c.hash));

describe('planMerge', () => {
    test('inserts rows that exist only in SQLite and keeps MySQL rows untouched', () => {
        const plan = planMerge(
            [{ id: A, name: 'from sqlite', completed: 0 }],
            [{ id: B, name: 'from mysql', completed: 1 }],
        );
        expect(plan.toInsert).toEqual([{ id: A, name: 'from sqlite', completed: 0 }]);
        expect(plan.conflicts).toHaveLength(0);
    });

    test('skips rows already present identically in MySQL', () => {
        const plan = planMerge([{ id: A, name: 'same', completed: 1 }], [{ id: A, name: 'same', completed: 1 }]);
        expect(plan.toInsert).toHaveLength(0);
        expect(plan.alreadyPresent).toBe(1);
    });

    test('never overwrites MySQL: a differing row becomes a conflict', () => {
        const plan = planMerge([{ id: A, name: 'sqlite version', completed: 0 }], [{ id: A, name: 'mysql version', completed: 1 }]);
        expect(plan.toInsert).toHaveLength(0);
        expect(plan.conflicts).toHaveLength(1);
        expect(plan.conflicts[0].reason).toBe('differs_from_mysql');
        expect(plan.conflicts[0].mysqlRows).toEqual([{ id: A, name: 'mysql version', completed: 1 }]);
    });

    test('keeps every variant when SQLite has several rows for one id', () => {
        const plan = planMerge(
            [
                { id: A, name: 'first', completed: 0 },
                { id: A, name: 'second', completed: 0 },
                { id: A, name: 'first', completed: 0 },
            ],
            [],
        );
        expect(plan.toInsert).toEqual([{ id: A, name: 'first', completed: 0 }]);
        expect(plan.conflicts.map(c => c.reason)).toEqual(['duplicate_id_in_sqlite']);
        expect(plan.exactDuplicatesInSqlite).toBe(1);
    });

    test('routes rows MySQL cannot store as-is to conflicts instead of truncating them', () => {
        const plan = planMerge(
            [
                { id: null, name: 'no id', completed: 0 },
                { id: B, name: 'x'.repeat(MAX_NAME_LENGTH + 1), completed: 0 },
                { id: C, name: 'weird', completed: 'maybe' },
                { id: A, name: Buffer.from('blob'), completed: 0 },
            ],
            [],
        );
        expect(plan.toInsert).toHaveLength(0);
        expect(plan.conflicts.map(c => c.reason)).toEqual([
            'invalid_id',
            'name_too_long',
            'invalid_completed',
            'invalid_name',
        ]);
    });

    test('normalizes the boolean representations both engines use', () => {
        const plan = planMerge(
            [
                { id: A, name: 'a', completed: 'true' },
                { id: B, name: 'b', completed: false },
                { id: C, name: null, completed: null },
            ],
            [{ id: A, name: 'a', completed: 1 }],
        );
        expect(plan.alreadyPresent).toBe(1);
        expect(plan.toInsert).toEqual([
            { id: B, name: 'b', completed: 0 },
            { id: C, name: null, completed: null },
        ]);
    });

    test('counts multi-byte characters like MySQL does', () => {
        const emoji = '😀'.repeat(MAX_NAME_LENGTH);
        expect(planMerge([{ id: A, name: emoji, completed: 0 }], []).toInsert).toHaveLength(1);
    });

    test('is idempotent: a second run over the merged state changes nothing', () => {
        const sqlite: RawRow[] = [
            { id: A, name: 'first', completed: 0 },
            { id: A, name: 'second', completed: 1 },
            { id: B, name: 'mine', completed: 0 },
        ];
        const mysql: RawRow[] = [{ id: B, name: 'theirs', completed: 0 }];

        const first = planMerge(sqlite, mysql);
        const second = planMerge(sqlite, [...mysql, ...first.toInsert]);

        expect(second.toInsert).toHaveLength(0);
        expect(hashesOf(second)).toEqual(hashesOf(first));
    });
});

describe('findUnaccountedRows', () => {
    const sqlite: RawRow[] = [
        { id: A, name: 'new', completed: 0 },
        { id: B, name: 'diff', completed: 0 },
        { id: null, name: 'broken', completed: 0 },
    ];
    const mysql: RawRow[] = [{ id: B, name: 'other', completed: 1 }];

    test('passes when every row was inserted or recorded', () => {
        const plan = planMerge(sqlite, mysql);
        expect(findUnaccountedRows(sqlite, [...mysql, ...plan.toInsert], hashesOf(plan))).toEqual([]);
    });

    test('detects a row that was neither inserted nor recorded', () => {
        const plan = planMerge(sqlite, mysql);
        expect(findUnaccountedRows(sqlite, mysql, hashesOf(plan))).toEqual([sqlite[0]]);
    });

    test('detects a missing conflict record', () => {
        const plan = planMerge(sqlite, mysql);
        const hashes = hashesOf(plan);
        hashes.delete(conflictHash('invalid_id', sqlite[2]));
        expect(findUnaccountedRows(sqlite, [...mysql, ...plan.toInsert], hashes)).toEqual([sqlite[2]]);
    });
});
