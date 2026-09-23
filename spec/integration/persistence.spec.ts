import type { Connection } from 'mysql2/promise';
import type { Persistence } from '../../src/types';
import { connect, emptyTables, insertTodoRows, selectTodoRows } from './support/database';

/*
 * Freezes the Persistence interface (src/types.ts) as the MySQL adapter
 * implements it, including getItem and updateItem, which no route calls on
 * MySQL but which any other implementation must reproduce.
 */

// src/persistence/index.ts picks the MySQL adapter, since MYSQL_HOST is set.
const db: Persistence = require('../../src/persistence');

const ID = '1e1e1e1e-0000-4000-8000-000000000001';
let connection: Connection;

beforeAll(async () => {
    await db.init();
    connection = await connect();
});

beforeEach(async () => {
    // Only the table this interface owns: the event tables may not exist yet.
    await emptyTables(connection, ['todo_items']);
});

afterAll(async () => {
    await connection?.end();
    await db.teardown();
});

describe('getItems', () => {
    test('resolves every row in insertion order, completed mapped to a boolean', async () => {
        await insertTodoRows(connection, [
            ['b', 'second id', 1],
            ['a', null, null],
            ['b', 'duplicate id', 0],
        ]);

        const items = await db.getItems();

        expect(JSON.stringify(items)).toBe(
            JSON.stringify([
                { id: 'b', name: 'second id', completed: true },
                { id: 'a', name: null, completed: false },
                { id: 'b', name: 'duplicate id', completed: false },
            ]),
        );
    });
});

describe('getItem', () => {
    test('resolves the item with that id, completed mapped to a boolean', async () => {
        await insertTodoRows(connection, [
            ['other', 'other', 1],
            [ID, 'Café 🎉', 1],
        ]);

        const item = await db.getItem(ID);

        expect(JSON.stringify(item)).toBe(JSON.stringify({ id: ID, name: 'Café 🎉', completed: true }));
    });

    test('resolves undefined for an unknown id', async () => {
        await insertTodoRows(connection, [[ID, 'task', 0]]);

        await expect(db.getItem('unknown')).resolves.toBeUndefined();
        await expect(db.getItem("x' OR '1'='1")).resolves.toBeUndefined();
    });

    test('resolves the first inserted row when the id repeats', async () => {
        await insertTodoRows(connection, [
            [ID, 'first', null],
            [ID, 'second', 1],
        ]);

        await expect(db.getItem(ID)).resolves.toEqual({ id: ID, name: 'first', completed: false });
    });
});

describe('storeItem', () => {
    test('inserts the item, completed stored as 1 or 0 by truthiness', async () => {
        await db.storeItem({ id: 'done', name: 'done', completed: true } as any);
        await db.storeItem({ id: 'open', name: 'open', completed: false } as any);
        await db.storeItem({ id: 'truthy', name: 'truthy', completed: 'no' } as any);
        await db.storeItem({ id: 'missing', name: undefined, completed: undefined } as any);

        expect(await selectTodoRows(connection)).toEqual([
            { id: 'done', name: 'done', completed: 1 },
            { id: 'open', name: 'open', completed: 0 },
            { id: 'truthy', name: 'truthy', completed: 1 },
            { id: 'missing', name: null, completed: 0 },
        ]);
    });

    test('rejects a name longer than 255 characters and inserts nothing', async () => {
        await expect(db.storeItem({ id: ID, name: 'a'.repeat(256), completed: false } as any)).rejects.toHaveProperty(
            'code',
            'ER_DATA_TOO_LONG',
        );
        expect(await selectTodoRows(connection)).toEqual([]);
    });

    test('inserts a second row for an id that already exists', async () => {
        await db.storeItem({ id: ID, name: 'first', completed: false } as any);
        await db.storeItem({ id: ID, name: 'second', completed: true } as any);

        expect(await selectTodoRows(connection)).toEqual([
            { id: ID, name: 'first', completed: 0 },
            { id: ID, name: 'second', completed: 1 },
        ]);
    });
});

describe('updateItem', () => {
    test('updates every row with that id, completed stored as 1 or 0 by truthiness', async () => {
        await insertTodoRows(connection, [
            [ID, 'copy A', 0],
            ['other', 'untouched', 0],
            [ID, 'copy B', 0],
        ]);

        await expect(db.updateItem(ID, { name: 'renamed 🎉', completed: 'false' } as any)).resolves.toBeUndefined();

        expect(await selectTodoRows(connection)).toEqual([
            { id: ID, name: 'renamed 🎉', completed: 1 },
            { id: 'other', name: 'untouched', completed: 0 },
            { id: ID, name: 'renamed 🎉', completed: 1 },
        ]);

        await db.updateItem(ID, { name: undefined, completed: undefined } as any);
        expect((await selectTodoRows(connection))[0]).toEqual({ id: ID, name: null, completed: 0 });
    });

    test('resolves without writing anything for an unknown id', async () => {
        await insertTodoRows(connection, [[ID, 'task', 0]]);

        await expect(db.updateItem('unknown', { name: 'x', completed: true } as any)).resolves.toBeUndefined();
        await expect(db.updateItem("x' OR '1'='1", { name: 'x', completed: true } as any)).resolves.toBeUndefined();

        expect(await selectTodoRows(connection)).toEqual([{ id: ID, name: 'task', completed: 0 }]);
    });
});

describe('removeItem', () => {
    test('deletes every row with that id and nothing else', async () => {
        await insertTodoRows(connection, [
            [ID, 'copy A', 0],
            ['other', 'kept', 1],
            [ID, 'copy B', 1],
        ]);

        await expect(db.removeItem(ID)).resolves.toBeUndefined();

        expect(await selectTodoRows(connection)).toEqual([{ id: 'other', name: 'kept', completed: 1 }]);
    });

    test('resolves without deleting anything for an unknown id', async () => {
        await insertTodoRows(connection, [[ID, 'kept', 0]]);

        await expect(db.removeItem("x' OR '1'='1")).resolves.toBeUndefined();

        expect(await selectTodoRows(connection)).toEqual([{ id: ID, name: 'kept', completed: 0 }]);
    });
});
