import fs from 'fs';
import path from 'path';
import type { Connection } from 'mysql2/promise';
import request, { type Response } from 'supertest';
import { closePool, ensureEventSchema } from '../../src/infrastructure/db/mysql';
import { createApp } from './support/app';
import {
    connect,
    countRows,
    emptyTables,
    insertTodoRows,
    selectNameBytes,
    selectOutboxRows,
    selectTodoRows,
} from './support/database';

/*
 * Freezes the HTTP contract of /items as the MySQL deployment serves it today,
 * so that replacing the persistence layer cannot change it unnoticed.
 *
 * Tests titled "current behaviour, to be fixed" pin a behaviour that is wrong
 * but real. Fixing it is a separate change, which updates the test on purpose.
 */

// src/persistence/index.ts picks the MySQL adapter, since MYSQL_HOST is set.
const db = require('../../src/persistence');

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const JSON_TYPE = 'application/json; charset=utf-8';
const ID = '0f0f0f0f-0000-4000-8000-000000000001';
const OTHER_ID = '0f0f0f0f-0000-4000-8000-000000000002';
const SQL_LOOKING_ID = "x' OR '1'='1";

const app = createApp();
let connection: Connection;
let serverErrors: jest.SpyInstance;

beforeAll(async () => {
    // Start-up order of src/index.ts: persistence, then the event schema.
    await db.init();
    await ensureEventSchema();
    connection = await connect();
});

beforeEach(async () => {
    await emptyTables(connection);
    // Express's default handler logs every error it answers.
    serverErrors = jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
    serverErrors.mockRestore();
});

afterAll(async () => {
    await connection?.end();
    await closePool();
    await db.teardown();
});

/**
 * The production error page: generic for the client, the actual cause logged
 * on the server only.
 */
function expectGenericServerError(res: Response, loggedCause: RegExp): void {
    expect(res.status).toBe(500);
    expect(res.headers['content-type']).toBe('text/html; charset=utf-8');
    expect(res.text).toContain('<pre>Internal Server Error</pre>');
    expect(res.text).not.toMatch(/ER_|sql|todo_items|outbox|too long|bind|TypeError|\.ts:\d+/i);
    expect(serverErrors).toHaveBeenCalledWith(expect.stringMatching(loggedCause));
}

test('the application under test is wired like src/index.ts', () => {
    // If this fails, src/index.ts changed: mirror the change in support/app.ts.
    const source = fs.readFileSync(path.join(__dirname, '../../src/index.ts'), 'utf8');
    const wiring = source
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(line => /^app\.\w+\(/.test(line));

    expect(wiring).toEqual([
        'app.use(express.json());',
        "app.use(express.static(path.join(__dirname, '../dist')));",
        "app.get('/items', getItems);",
        "app.post('/items', addItem);",
        "app.put('/items/:id', updateItem);",
        "app.delete('/items/:id', deleteItem);",
        "app.listen(3000, () => console.log('Listening on port 3000'));",
    ]);
});

describe('GET /items', () => {
    test('answers 200 with an empty JSON array when there is no item', async () => {
        const res = await request(app).get('/items');

        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toBe(JSON_TYPE);
        expect(res.text).toBe('[]');
    });

    test('returns every item as {id, name, completed}, in insertion order', async () => {
        // No ORDER BY: InnoDB returns a table without primary key in insertion
        // order, and the list users see relies on it.
        await insertTodoRows(connection, [
            ['cccccccc-0000-4000-8000-000000000003', 'inserted first', 0],
            ['aaaaaaaa-0000-4000-8000-000000000001', 'inserted second', 1],
            ['bbbbbbbb-0000-4000-8000-000000000002', 'inserted third', 0],
        ]);

        const res = await request(app).get('/items');

        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toBe(JSON_TYPE);
        expect(res.headers['x-powered-by']).toBe('Express');
        // Compared as text: key order is part of the body, and so of its ETag.
        expect(res.text).toBe(
            JSON.stringify([
                { id: 'cccccccc-0000-4000-8000-000000000003', name: 'inserted first', completed: false },
                { id: 'aaaaaaaa-0000-4000-8000-000000000001', name: 'inserted second', completed: true },
                { id: 'bbbbbbbb-0000-4000-8000-000000000002', name: 'inserted third', completed: false },
            ]),
        );
    });

    test('maps stored values: completed is true for 1 only, and NULL columns stay null', async () => {
        await insertTodoRows(connection, [
            ['completed-null', 'completed is NULL', null],
            ['completed-two', 'completed is 2', 2],
            ['name-null', null, 1],
            [null, 'id is NULL', 0],
        ]);

        const res = await request(app).get('/items');

        expect(res.status).toBe(200);
        expect(res.text).toBe(
            JSON.stringify([
                { id: 'completed-null', name: 'completed is NULL', completed: false },
                { id: 'completed-two', name: 'completed is 2', completed: false },
                { id: 'name-null', name: null, completed: true },
                { id: null, name: 'id is NULL', completed: false },
            ]),
        );
    });

    test('lists rows sharing an id as separate items (the table has no primary key)', async () => {
        await insertTodoRows(connection, [
            [ID, 'first copy', 0],
            [ID, 'second copy', 1],
        ]);

        const res = await request(app).get('/items');

        expect(res.body).toEqual([
            { id: ID, name: 'first copy', completed: false },
            { id: ID, name: 'second copy', completed: true },
        ]);
    });

    test('answers 304 to a conditional request while the list is unchanged', async () => {
        await insertTodoRows(connection, [[ID, 'cached', 0]]);

        const first = await request(app).get('/items');
        expect(first.headers.etag).toMatch(/^W\/"[^"]+"$/);

        const second = await request(app).get('/items').set('If-None-Match', first.headers.etag);
        expect(second.status).toBe(304);
        expect(second.text).toBe('');
    });
});

describe('POST /items', () => {
    test('stores a new, not completed item and answers 200 with it', async () => {
        const res = await request(app).post('/items').send({ name: 'Buy milk' });

        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toBe(JSON_TYPE);
        expect(res.body.id).toMatch(UUID_V4);
        expect(res.text).toBe(JSON.stringify({ id: res.body.id, name: 'Buy milk', completed: false }));
        expect(await selectTodoRows(connection)).toEqual([{ id: res.body.id, name: 'Buy milk', completed: 0 }]);
        expect(await countRows(connection, 'outbox_events')).toBe(0);
    });

    test('gives each item its own id and appends it to the list', async () => {
        const first = await request(app).post('/items').send({ name: 'first' });
        const second = await request(app).post('/items').send({ name: 'second' });

        expect(first.body.id).not.toBe(second.body.id);
        const list = await request(app).get('/items');
        expect(list.body).toEqual([first.body, second.body]);
    });

    test('keeps accents, emoji and other scripts byte for byte', async () => {
        const name = 'Café crème, déjà vu 🎉 日本語 👩🏽‍💻';

        const res = await request(app).post('/items').send({ name });

        expect(res.status).toBe(200);
        expect(res.body.name).toBe(name);
        expect(await selectNameBytes(connection, res.body.id)).toEqual([
            Buffer.from(name, 'utf8').toString('hex').toUpperCase(),
        ]);
        const list = await request(app).get('/items');
        expect(list.body).toEqual([{ id: res.body.id, name, completed: false }]);
    });

    test('accepts a name of 255 characters, each emoji counting as one', async () => {
        const name = '😀'.repeat(255);

        const res = await request(app).post('/items').send({ name });

        expect(res.status).toBe(200);
        expect(await selectTodoRows(connection)).toEqual([{ id: res.body.id, name, completed: 0 }]);
    });

    test('answers 400 to malformed JSON without touching the database', async () => {
        const res = await request(app)
            .post('/items')
            .set('Content-Type', 'application/json')
            .send('{"name":');

        expect(res.status).toBe(400);
        expect(res.headers['content-type']).toBe('text/html; charset=utf-8');
        expect(res.text).toContain('<pre>Bad Request</pre>');
        expect(await countRows(connection, 'todo_items')).toBe(0);
    });

    test('current behaviour, to be fixed: a name over 255 characters answers 500 and stores nothing', async () => {
        const res = await request(app).post('/items').send({ name: 'a'.repeat(256) });

        expectGenericServerError(res, /Data too long for column 'name'/);
        expect(await countRows(connection, 'todo_items')).toBe(0);
    });

    test('current behaviour, to be fixed: without a name, answers 200 and stores NULL', async () => {
        const res = await request(app).post('/items').send({});

        expect(res.status).toBe(200);
        expect(res.text).toBe(JSON.stringify({ id: res.body.id, completed: false }));
        expect(await selectTodoRows(connection)).toEqual([{ id: res.body.id, name: null, completed: 0 }]);
    });

    test.each([
        { given: 'a number', name: 42, stored: '42' },
        { given: 'a boolean', name: true, stored: '1' },
        { given: 'an object', name: { a: 1 }, stored: '[object Object]' },
    ])(
        'current behaviour, to be fixed: $given as name is stored as $stored but echoed as sent',
        async ({ name, stored }) => {
            const res = await request(app).post('/items').send({ name });

            expect(res.status).toBe(200);
            expect(res.body).toEqual({ id: expect.stringMatching(UUID_V4), name, completed: false });
            expect(await selectTodoRows(connection)).toEqual([{ id: res.body.id, name: stored, completed: 0 }]);
        },
    );

    test('current behaviour, to be fixed: an array as name answers 500 and stores nothing', async () => {
        const res = await request(app).post('/items').send({ name: ['a', 'b'] });

        expectGenericServerError(res, /Column count doesn't match value count/);
        expect(await countRows(connection, 'todo_items')).toBe(0);
    });

    test('current behaviour, to be fixed: without a JSON body, answers 500 and stores nothing', async () => {
        const res = await request(app).post('/items');

        expectGenericServerError(res, /Cannot read properties of undefined \(reading 'name'\)/);
        expect(await countRows(connection, 'todo_items')).toBe(0);
    });
});

describe('PUT /items/:id', () => {
    test('updates the item and answers 200 with it', async () => {
        await insertTodoRows(connection, [
            [ID, 'Old name', 0],
            [OTHER_ID, 'Untouched', 0],
        ]);

        const res = await request(app).put(`/items/${ID}`).send({ name: 'New name', completed: false });

        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toBe(JSON_TYPE);
        expect(res.text).toBe(JSON.stringify({ id: ID, name: 'New name', completed: false }));
        expect(await selectTodoRows(connection)).toEqual([
            { id: ID, name: 'New name', completed: 0 },
            { id: OTHER_ID, name: 'Untouched', completed: 0 },
        ]);
    });

    test('answers 404 {"error":"Item not found"} for an unknown id and writes nothing', async () => {
        await insertTodoRows(connection, [[ID, 'Existing', 0]]);

        for (const id of ['unknown-id', SQL_LOOKING_ID]) {
            const res = await request(app)
                .put(`/items/${encodeURIComponent(id)}`)
                .send({ name: 'x', completed: true });

            expect(res.status).toBe(404);
            expect(res.headers['content-type']).toBe(JSON_TYPE);
            expect(res.text).toBe('{"error":"Item not found"}');
        }
        expect(await selectTodoRows(connection)).toEqual([{ id: ID, name: 'Existing', completed: 0 }]);
        expect(await countRows(connection, 'outbox_events')).toBe(0);
    });

    test('keeps accents and emoji', async () => {
        await insertTodoRows(connection, [[ID, 'plain', 0]]);
        const name = 'Réunion à 14 h ☕️ — 会議';

        const res = await request(app).put(`/items/${ID}`).send({ name, completed: false });

        expect(res.body).toEqual({ id: ID, name, completed: false });
        expect(await selectNameBytes(connection, ID)).toEqual([Buffer.from(name, 'utf8').toString('hex').toUpperCase()]);
        expect((await request(app).get('/items')).body).toEqual([{ id: ID, name, completed: false }]);
    });

    test('completing an item answers completed: true and records one task.completed event', async () => {
        await insertTodoRows(connection, [[ID, 'Ship it 🚀', 0]]);
        const before = Date.now();

        const res = await request(app)
            .put(`/items/${ID}`)
            .set('X-Correlation-Id', 'request-42')
            .send({ name: 'Ship it 🚀', completed: true });

        const after = Date.now();
        expect(res.status).toBe(200);
        expect(res.text).toBe(JSON.stringify({ id: ID, name: 'Ship it 🚀', completed: true }));
        expect(await selectTodoRows(connection)).toEqual([{ id: ID, name: 'Ship it 🚀', completed: 1 }]);

        const events = await selectOutboxRows(connection);
        expect(events).toHaveLength(1);
        const [event] = events;
        expect(event).toMatchObject({
            type: 'task.completed',
            version: 1,
            aggregate_id: ID,
            correlation_id: 'request-42',
            actor_id: null,
            published_at: null,
        });
        expect(event.event_id).toMatch(UUID_V4);
        expect(event.occurred_at.getTime()).toBeGreaterThanOrEqual(before);
        expect(event.occurred_at.getTime()).toBeLessThanOrEqual(after);
        expect(event.payload).toEqual({ taskId: ID, name: 'Ship it 🚀', completedAt: expect.any(String) });
        const completedAt = Date.parse((event.payload as { completedAt: string }).completedAt);
        expect(completedAt).toBeGreaterThanOrEqual(before);
        expect(completedAt).toBeLessThanOrEqual(after);
    });

    test('without X-Correlation-Id, the event carries a generated UUID', async () => {
        await insertTodoRows(connection, [[ID, 'task', 0]]);

        await request(app).put(`/items/${ID}`).send({ name: 'task', completed: true });

        const [event] = await selectOutboxRows(connection);
        expect(event.correlation_id).toMatch(UUID_V4);
    });

    test('records no event when the item was already completed, or is not being completed', async () => {
        await insertTodoRows(connection, [
            [ID, 'done', 1],
            [OTHER_ID, 'open', 0],
        ]);

        const responses = [
            await request(app).put(`/items/${ID}`).send({ name: 'done', completed: true }),
            await request(app).put(`/items/${ID}`).send({ name: 'done', completed: false }),
            await request(app).put(`/items/${OTHER_ID}`).send({ name: 'still open', completed: false }),
        ];

        expect(responses.map(res => res.status)).toEqual([200, 200, 200]);
        expect(await countRows(connection, 'outbox_events')).toBe(0);
    });

    test('concurrent completions of one item record a single event', async () => {
        await insertTodoRows(connection, [[ID, 'race', 0]]);

        const responses = await Promise.all(
            Array.from({ length: 5 }, () => request(app).put(`/items/${ID}`).send({ name: 'race', completed: true })),
        );

        expect(responses.map(res => res.status)).toEqual([200, 200, 200, 200, 200]);
        expect(await countRows(connection, 'outbox_events')).toBe(1);
    });

    test('updates every row sharing the id and records one event (the table has no primary key)', async () => {
        await insertTodoRows(connection, [
            [ID, 'copy A', 0],
            [ID, 'copy B', 0],
        ]);

        const res = await request(app).put(`/items/${ID}`).send({ name: 'merged', completed: true });

        expect(res.status).toBe(200);
        expect(await selectTodoRows(connection)).toEqual([
            { id: ID, name: 'merged', completed: 1 },
            { id: ID, name: 'merged', completed: 1 },
        ]);
        expect(await countRows(connection, 'outbox_events')).toBe(1);
    });

    test('current behaviour, to be fixed: completed "false" (a string) completes the item', async () => {
        await insertTodoRows(connection, [[ID, 'task', 0]]);

        const res = await request(app).put(`/items/${ID}`).send({ name: 'task', completed: 'false' });

        expect(res.body).toEqual({ id: ID, name: 'task', completed: true });
        expect(await selectTodoRows(connection)).toEqual([{ id: ID, name: 'task', completed: 1 }]);
        expect(await countRows(connection, 'outbox_events')).toBe(1);
    });

    test('current behaviour, to be fixed: without completed, the item is marked not completed', async () => {
        await insertTodoRows(connection, [[ID, 'task', 1]]);

        const res = await request(app).put(`/items/${ID}`).send({ name: 'renamed' });

        expect(res.body).toEqual({ id: ID, name: 'renamed', completed: false });
        expect(await selectTodoRows(connection)).toEqual([{ id: ID, name: 'renamed', completed: 0 }]);
    });

    test('current behaviour, to be fixed: without a name, answers 500 and changes nothing', async () => {
        await insertTodoRows(connection, [[ID, 'task', 0]]);

        const res = await request(app).put(`/items/${ID}`).send({ completed: true });

        expectGenericServerError(res, /Bind parameters must not contain undefined/);
        expect(await selectTodoRows(connection)).toEqual([{ id: ID, name: 'task', completed: 0 }]);
        expect(await countRows(connection, 'outbox_events')).toBe(0);
    });

    test.each([
        { given: 'a number', name: 42, stored: '42' },
        { given: 'a boolean', name: true, stored: '1' },
        { given: 'an object', name: { a: 1 }, stored: '{"a":1}' },
        { given: 'null', name: null, stored: null },
    ])(
        'current behaviour, to be fixed: $given as name is stored as $stored but echoed as sent',
        async ({ name, stored }) => {
            await insertTodoRows(connection, [[ID, 'task', 0]]);

            const res = await request(app).put(`/items/${ID}`).send({ name, completed: false });

            expect(res.status).toBe(200);
            expect(res.text).toBe(JSON.stringify({ id: ID, name, completed: false }));
            expect(await selectTodoRows(connection)).toEqual([{ id: ID, name: stored, completed: 0 }]);
        },
    );

    test('current behaviour, to be fixed: an X-Correlation-Id over 64 characters makes a completion fail with 500 and change nothing', async () => {
        await insertTodoRows(connection, [[ID, 'task', 0]]);

        const completion = await request(app)
            .put(`/items/${ID}`)
            .set('X-Correlation-Id', 'x'.repeat(65))
            .send({ name: 'renamed', completed: true });

        expectGenericServerError(completion, /Data too long for column 'correlation_id'/);
        expect(await selectTodoRows(connection)).toEqual([{ id: ID, name: 'task', completed: 0 }]);
        expect(await countRows(connection, 'outbox_events')).toBe(0);

        // Without a completion there is no event to store, and the header is ignored.
        const rename = await request(app)
            .put(`/items/${ID}`)
            .set('X-Correlation-Id', 'x'.repeat(65))
            .send({ name: 'renamed', completed: false });
        expect(rename.status).toBe(200);
    });

    test('current behaviour, to be fixed: without a JSON body, answers 500 and changes nothing', async () => {
        await insertTodoRows(connection, [[ID, 'task', 0]]);

        const res = await request(app).put(`/items/${ID}`);

        expectGenericServerError(res, /Cannot read properties of undefined \(reading 'name'\)/);
        expect(await selectTodoRows(connection)).toEqual([{ id: ID, name: 'task', completed: 0 }]);
    });
});

describe('DELETE /items/:id', () => {
    test('removes the item and answers 200 "OK" as plain text', async () => {
        await insertTodoRows(connection, [
            [ID, 'to delete', 0],
            [OTHER_ID, 'kept', 1],
        ]);

        const res = await request(app).delete(`/items/${ID}`);

        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toBe('text/plain; charset=utf-8');
        expect(res.text).toBe('OK');
        expect(await selectTodoRows(connection)).toEqual([{ id: OTHER_ID, name: 'kept', completed: 1 }]);
        expect((await request(app).get('/items')).body).toEqual([{ id: OTHER_ID, name: 'kept', completed: true }]);
        expect(await countRows(connection, 'outbox_events')).toBe(0);
    });

    test('answers 200 "OK" for an unknown id and deletes nothing', async () => {
        await insertTodoRows(connection, [[ID, 'kept', 0]]);

        for (const id of ['unknown-id', SQL_LOOKING_ID]) {
            const res = await request(app).delete(`/items/${encodeURIComponent(id)}`);

            expect(res.status).toBe(200);
            expect(res.text).toBe('OK');
        }
        expect(await selectTodoRows(connection)).toEqual([{ id: ID, name: 'kept', completed: 0 }]);
    });

    test('removes every row sharing the id', async () => {
        await insertTodoRows(connection, [
            [ID, 'copy A', 0],
            [OTHER_ID, 'kept', 0],
            [ID, 'copy B', 1],
        ]);

        const res = await request(app).delete(`/items/${ID}`);

        expect(res.status).toBe(200);
        expect(await selectTodoRows(connection)).toEqual([{ id: OTHER_ID, name: 'kept', completed: 0 }]);
    });
});
