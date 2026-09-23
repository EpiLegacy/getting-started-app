import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Connection, RowDataPacket } from 'mysql2/promise';
import request from 'supertest';
import * as outbox from '../../src/infrastructure/outbox/outboxRepository.drizzle';
import { init, teardown } from '../../src/infrastructure/db/drizzle';
import { createApp } from './support/app';
import { connect, dropTables } from './support/database';

const app = createApp();
let connection: Connection;
const tables = ['todo_items', 'sessions', 'users', 'outbox_events', 'notifications', 'processed_events'];
const fields = { name: 'My task', completed: false, deadline: '2026-10-01', priorisation: 'high' };
let alice: ReturnType<typeof request.agent>;
let bob: ReturnType<typeof request.agent>;
let aliceId: string;
let bobId: string;

async function migrate(file: string) {
    for (const sql of readFileSync(path.join(__dirname, '../../drizzle', file), 'utf8').split('--> statement-breakpoint')) {
        if (sql.trim()) await connection.query(sql);
    }
}
async function rows(sql: string): Promise<RowDataPacket[]> {
    return (await connection.query<RowDataPacket[]>(sql))[0];
}

beforeAll(async () => {
    connection = await connect();
    await dropTables(connection, tables);
    await migrate('0000_silky_leo.sql');
    await migrate('0001_auth.sql');
    // Actual legacy edge cases: duplicate ids, a missing id, and NULL fields.
    await connection.query("INSERT INTO todo_items (id, name, completed) VALUES ('duplicate', 'First', 0), ('duplicate', 'Second', 1), (NULL, NULL, NULL)");
    await migrate('0002_task_ownership.sql');
    await init();
});

afterAll(async () => {
    await teardown();
    if (connection) {
        await dropTables(connection, tables);
        // Restore the old schema used by the legacy adapter contract suites.
        await migrate('0000_silky_leo.sql');
        await connection.query('ALTER TABLE todo_items ADD deadline varchar(255), ADD priorisation varchar(255)');
        await connection.end();
    }
});

test('migration preserves every legacy row and adds distinct keys without assigning owners', async () => {
    const migrated = await rows('SELECT * FROM todo_items ORDER BY task_key');
    expect(migrated).toHaveLength(3);
    expect(migrated.map(row => [row.id, row.name, row.completed, row.user_id])).toEqual([
        ['duplicate', 'First', 0, null], ['duplicate', 'Second', 1, null], [null, null, null, null],
    ]);
    expect(new Set(migrated.map(row => row.task_key)).size).toBe(3);
});

test('migration preserves deployments that already added deadline and priority manually', async () => {
    await connection.query('DROP TABLE todo_items');
    await connection.query('CREATE TABLE todo_items (id varchar(36), name varchar(255), completed boolean, deadline varchar(255), priorisation varchar(255))');
    await connection.query("INSERT INTO todo_items VALUES ('existing', 'Keep all fields', 1, '2026-12-01', 'high')");
    await migrate('0002_task_ownership.sql');
    const [task] = await rows('SELECT * FROM todo_items');
    expect(task).toMatchObject({ id: 'existing', name: 'Keep all fields', completed: 1, deadline: '2026-12-01', priorisation: 'high', user_id: null });
    expect(task.task_key).toBeGreaterThan(0);
});

describe('authenticated task API', () => {
    beforeEach(async () => {
        await connection.query('DELETE FROM todo_items');
        await connection.query('DELETE FROM sessions');
        await connection.query('DELETE FROM users');
        await connection.query('DELETE FROM outbox_events');
        alice = request.agent(app);
        bob = request.agent(app);
        const password = 'correct horse battery staple';
        aliceId = (await alice.post('/auth/register').send({ email: 'alice@example.com', password })).body.user.id;
        bobId = (await bob.post('/auth/register').send({ email: 'bob@example.com', password })).body.user.id;
    });

    test('every operation requires a valid session', async () => {
        for (const response of await Promise.all([
            request(app).get('/items'), request(app).get('/items/unassigned'),
            request(app).post('/items').send(fields), request(app).put('/items/1').send(fields),
            request(app).delete('/items/1'), request(app).post('/items/1/claim'), request(app).patch('/items/1').send({ completed: true }),
        ])) expect(response.status).toBe(401);
    });

    test('new tasks belong to the session user, ignoring supplied owner and id', async () => {
        const created = await alice.post('/items').send({ ...fields, userId: bobId, id: 'spoof', completed: true });
        expect(created.status).toBe(201);
        expect(created.body).toMatchObject({ ...fields, userId: aliceId });
        expect(created.body.id).toMatch(/^\d+$/);
        expect((await alice.get('/items')).body).toEqual([created.body]);
        expect((await bob.get('/items')).body).toEqual([]);
        expect((await bob.get('/items/unassigned')).body).toEqual([]);
        expect((await bob.put(`/items/${created.body.id}`).send(fields)).status).toBe(404);
        expect((await bob.delete(`/items/${created.body.id}`)).status).toBe(404);
        expect((await bob.post(`/items/${created.body.id}/claim`)).status).toBe(409);
        expect((await alice.get('/items')).body).toEqual([created.body]);
    });

    test('duplicate and missing legacy ids are individually claimable without editing their data', async () => {
        await connection.query("INSERT INTO todo_items (id, name, completed) VALUES ('same', 'First', 0), ('same', 'Second', 1), (NULL, NULL, NULL)");
        const tasks = (await alice.get('/items/unassigned')).body;
        expect(tasks).toHaveLength(3);
        expect((await alice.put(`/items/${tasks[0].id}`).send(fields)).status).toBe(404);
        expect((await alice.delete(`/items/${tasks[0].id}`)).status).toBe(404);
        expect((await alice.post(`/items/${tasks[0].id}/claim`)).status).toBe(204);
        expect((await bob.post(`/items/${tasks[2].id}/claim`)).status).toBe(204);
        expect((await bob.get('/items/unassigned')).body).toEqual([tasks[1]]);
        expect((await alice.get('/items')).body).toEqual([{ ...tasks[0], userId: aliceId }]);
        expect((await bob.get('/items')).body).toEqual([{ ...tasks[2], userId: bobId }]);
        const stored = await rows('SELECT id, name, completed FROM todo_items ORDER BY task_key');
        expect((await bob.patch(`/items/${tasks[2].id}`).send({ completed: true })).status).toBe(200);
        expect((await alice.patch(`/items/${tasks[2].id}`).send({ completed: false })).status).toBe(404);
        expect(stored).toEqual([{ id: 'same', name: 'First', completed: 0 }, { id: 'same', name: 'Second', completed: 1 }, { id: null, name: null, completed: null }]);
    });

    test('concurrent claims have exactly one winner and cannot transfer ownership', async () => {
        await connection.query("INSERT INTO todo_items (name) VALUES ('Claim me')");
        const [task] = (await alice.get('/items/unassigned')).body;
        const results = await Promise.all([alice.post(`/items/${task.id}/claim`), bob.post(`/items/${task.id}/claim`)]);
        expect(results.map(result => result.status).sort()).toEqual([204, 409]);
        const owner = results[0].status === 204 ? aliceId : bobId;
        expect((await rows('SELECT user_id FROM todo_items'))[0].user_id).toBe(owner);
        expect((await alice.post(`/items/${task.id}/claim`)).status).toBe(409);
        expect((await bob.post(`/items/${task.id}/claim`)).status).toBe(409);
        expect((await alice.get('/items/unassigned')).body).toEqual([]);
    });

    test('owner edits retain deadlines and priorities and emit one completion event with their identity', async () => {
        const created = await alice.post('/items').send(fields);
        const update = { ...fields, name: 'Done', completed: true, deadline: '2026-10-02', priorisation: 'low', userId: bobId };
        for (let i = 0; i < 2; i++) {
            const result = await alice.put(`/items/${created.body.id}`).send(update);
            expect(result.status).toBe(200);
            expect(result.body).toMatchObject({ ...update, userId: aliceId });
        }
        const events = await rows('SELECT actor_id, aggregate_id FROM outbox_events');
        expect(events).toEqual([{ actor_id: aliceId, aggregate_id: created.body.id }]);
        expect((await alice.delete(`/items/${created.body.id}`)).status).toBe(204);
        expect((await alice.get('/items')).body).toEqual([]);
    });

    test('a failed completion event rolls back the task update', async () => {
        const created = await alice.post('/items').send(fields);
        const enqueue = jest.spyOn(outbox, 'enqueue').mockRejectedValueOnce(new Error('outbox unavailable'));
        const logged = jest.spyOn(console, 'error').mockImplementation(() => {});
        try {
            expect((await alice.patch(`/items/${created.body.id}`).send({ completed: true })).status).toBe(500);
            expect((await alice.get('/items')).body[0].completed).toBe(false);
            expect(await rows('SELECT * FROM outbox_events')).toEqual([]);
        } finally { enqueue.mockRestore(); logged.mockRestore(); }
    });

    test('deleting an owner cannot turn private tasks into shared unassigned tasks', async () => {
        await alice.post('/items').send(fields);
        await expect(connection.query('DELETE FROM users WHERE id = ?', [aliceId]))
            .rejects.toMatchObject({ code: 'ER_ROW_IS_REFERENCED_2' });
        expect((await alice.get('/items')).body).toHaveLength(1);
        expect((await bob.get('/items/unassigned')).body).toEqual([]);
    });

    test('invalid input and forged or expired sessions cannot mutate tasks', async () => {
        expect((await alice.post('/items').send({ ...fields, name: '' })).status).toBe(400);
        expect((await alice.post('/items').send({ ...fields, deadline: 'not-a-date' })).status).toBe(400);
        expect((await alice.post('/items/1e0/claim')).status).toBe(404);
        expect((await request(app).get('/items').set('Cookie', 'sid=forged')).status).toBe(401);
        await connection.query('UPDATE sessions SET expires_at = ?', [new Date(0)]);
        expect((await alice.get('/items')).status).toBe(401);
        expect((await alice.post('/items/1/claim')).status).toBe(401);
    });
});
