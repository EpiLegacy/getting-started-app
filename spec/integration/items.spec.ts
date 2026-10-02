import { readFileSync } from 'node:fs';
import type { Server } from 'node:http';
import path from 'node:path';
import type { Connection, RowDataPacket } from 'mysql2/promise';
import request from 'supertest';
import * as outbox from '../../src/infrastructure/outbox/outboxRepository.drizzle';
import { init, teardown } from '../../src/infrastructure/db/drizzle';
import { closeServers, listen } from '../support/server';
import { createApp } from './support/app';
import { connect, dropTables } from './support/database';

let app: Server;
let connection: Connection;
const tables = ['project_items', 'project_members', 'projects', 'todo_items', 'sessions', 'users', 'outbox_events', 'notifications', 'processed_events'];
const fields = { name: 'My task', completed: false, deadline: '2026-10-01', priorisation: 'high', status: 'todo' };
let alice: ReturnType<typeof request.agent>;
let bob: ReturnType<typeof request.agent>;
let aliceId: string;
let bobId: string;
let aliceProject: string;
let bobProject: string;

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
    app = await listen(createApp());
});

afterAll(async () => {
    await closeServers();
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
    // The API runs on the current schema; the tests above need the 0002 one.
    beforeAll(async () => {
        await migrate('0003_notifications_sent_at.sql');
        await migrate('0004_burly_xavin.sql');
    });

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
        aliceProject = (await alice.post('/projects').send({ name: 'Alice project' })).body.project.id;
        bobProject = (await bob.post('/projects').send({ name: 'Bob project' })).body.project.id;
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
        expect((await bob.post(`/items/${created.body.id}/claim`).send({ projectId: bobProject, userId: bobId })).status).toBe(409);
        expect((await alice.get('/items')).body).toEqual([created.body]);
    });

    test('duplicate and missing legacy ids are individually claimable without editing their data', async () => {
        await connection.query("INSERT INTO todo_items (id, name, completed) VALUES ('same', 'First', 0), ('same', 'Second', 1), (NULL, NULL, NULL)");
        const tasks = (await alice.get('/items/unassigned')).body;
        expect(tasks).toHaveLength(3);
        expect((await alice.put(`/items/${tasks[0].id}`).send(fields)).status).toBe(404);
        expect((await alice.delete(`/items/${tasks[0].id}`)).status).toBe(404);
        expect((await alice.post(`/items/${tasks[0].id}/claim`).send({ projectId: aliceProject, userId: aliceId })).status).toBe(204);
        expect((await bob.post(`/items/${tasks[2].id}/claim`).send({ projectId: bobProject, userId: bobId })).status).toBe(204);
        expect((await bob.get('/items/unassigned')).body).toEqual([tasks[1]]);
        expect((await alice.get('/items')).body).toEqual([expect.objectContaining({ id: tasks[0].id, userId: aliceId })]);
        expect((await bob.get('/items')).body).toEqual([expect.objectContaining({ id: tasks[2].id, userId: bobId })]);
        const stored = await rows('SELECT id, name, completed FROM todo_items ORDER BY task_key');
        expect((await bob.patch(`/items/${tasks[2].id}`).send({ completed: true })).status).toBe(200);
        expect((await alice.patch(`/items/${tasks[2].id}`).send({ completed: false })).status).toBe(404);
        expect(stored).toEqual([{ id: 'same', name: 'First', completed: 0 }, { id: 'same', name: 'Second', completed: 1 }, { id: null, name: null, completed: null }]);
    });

    test('concurrent claims have exactly one winner and cannot transfer ownership', async () => {
        await connection.query("INSERT INTO todo_items (name) VALUES ('Claim me')");
        const [task] = (await alice.get('/items/unassigned')).body;
        const results = await Promise.all([alice.post(`/items/${task.id}/claim`).send({ projectId: aliceProject, userId: aliceId }), bob.post(`/items/${task.id}/claim`).send({ projectId: bobProject, userId: bobId })]);
        expect(results.map(result => result.status).sort()).toEqual([204, 409]);
        const owner = results[0].status === 204 ? aliceId : bobId;
        expect((await rows('SELECT user_id FROM todo_items'))[0].user_id).toBe(owner);
        expect((await alice.post(`/items/${task.id}/claim`).send({ projectId: aliceProject, userId: aliceId })).status).toBe(409);
        expect((await bob.post(`/items/${task.id}/claim`).send({ projectId: bobProject, userId: bobId })).status).toBe(409);
        expect((await alice.get('/items/unassigned')).body).toEqual([]);
    });

    test('repairs partial assignments while enforcing project visibility and membership', async () => {
        const own = (await alice.post('/items').send(fields)).body;
        expect((await alice.get('/items/unassigned')).body).toEqual([{ ...own, projectId: null }]);
        expect((await bob.get('/items/unassigned')).body).toEqual([]);
        expect((await alice.post(`/items/${own.id}/claim`).send({ projectId: aliceProject, userId: bobId })).status).toBe(409);
        expect((await alice.post(`/items/${own.id}/claim`).send({ projectId: bobProject, userId: bobId })).status).toBe(409);
        expect((await rows('SELECT * FROM project_items'))).toEqual([]);
        expect((await alice.post(`/items/${own.id}/claim`).send({ projectId: aliceProject, userId: aliceId })).status).toBe(204);
        await connection.query('UPDATE todo_items SET user_id = NULL WHERE task_key = ?', [own.id]);
        expect((await alice.get('/items/forUser')).body).toEqual([]);
        expect((await bob.get('/items/unassigned')).body).toEqual([]);
        expect((await alice.get('/items/unassigned')).body[0]).toMatchObject({ id: own.id, projectId: aliceProject, userId: null });
        expect((await bob.post(`/items/${own.id}/claim`).send({ projectId: bobProject, userId: bobId })).status).toBe(409);
        await alice.post(`/projects/${aliceProject}/members`).send({ email: 'bob@example.com' });
        expect((await alice.post(`/items/${own.id}/claim`).send({ projectId: aliceProject, userId: bobId })).status).toBe(204);
        expect((await alice.get('/items/unassigned')).body).toEqual([]);
        expect((await alice.get('/items/forUser')).body[0]).toMatchObject({ taskKey: Number(own.id), userId: bobId });
    });

    test('owner edits retain deadlines and priorities and emit one completion event with their identity', async () => {
        const created = await alice.post('/items').send(fields);
        const update = { ...fields, name: 'Done', completed: true, status: 'completed', deadline: '2026-10-02', priorisation: 'low', userId: bobId };
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

    test('moving a card to Completed completes the task and emits one event per completion', async () => {
        const created = await alice.post('/items').send(fields);
        const move = (body: object) => alice.patch(`/items/${created.body.id}`).send(body);
        const events = async () => (await rows('SELECT aggregate_id FROM outbox_events')).length;

        expect((await move({ status: 'inProgress' })).body).toMatchObject({ status: 'inProgress', completed: false });
        expect(await events()).toBe(0);
        expect((await move({ status: 'completed' })).body).toMatchObject({ status: 'completed', completed: true });
        expect((await move({ status: 'completed' })).status).toBe(200);
        expect(await events()).toBe(1);

        // Reopening and completing again is a new completion; completed alone moves the card.
        expect((await move({ completed: false })).body).toMatchObject({ status: 'todo', completed: false });
        expect((await move({ completed: true })).body).toMatchObject({ status: 'completed', completed: true });
        expect(await events()).toBe(2);
        expect((await alice.get('/items')).body[0]).toMatchObject({ status: 'completed', completed: true });
    });

    test('a completed flag that contradicts the status is rejected without writing anything', async () => {
        const created = await alice.post('/items').send(fields);
        expect((await alice.put(`/items/${created.body.id}`).send({ ...fields, completed: true })).status).toBe(400);
        expect((await alice.patch(`/items/${created.body.id}`).send({ completed: false, status: 'completed' })).status).toBe(400);
        expect(await rows('SELECT completed, status FROM todo_items')).toEqual([{ completed: 0, status: 'todo' }]);
        expect(await rows('SELECT * FROM outbox_events')).toEqual([]);
    });

    test('migration 0005 aligns completed with the Kanban column of existing rows', async () => {
        await connection.query(`INSERT INTO todo_items (id, completed, status) VALUES
            ('legacy-done', 1, 'todo'), ('moved-done', 0, 'completed'), ('moved-back', 1, 'inProgress'),
            ('open', 0, 'todo'), ('null-open', NULL, 'todo'), ('null-done', NULL, 'completed')`);
        await migrate('0005_sync_task_completion.sql');
        expect(await rows('SELECT id, completed, status FROM todo_items ORDER BY task_key')).toEqual([
            { id: 'legacy-done', completed: 1, status: 'completed' },
            { id: 'moved-done', completed: 1, status: 'completed' },
            { id: 'moved-back', completed: 0, status: 'inProgress' },
            { id: 'open', completed: 0, status: 'todo' },
            { id: 'null-open', completed: null, status: 'todo' },
            { id: 'null-done', completed: 1, status: 'completed' },
        ]);
        expect(await rows('SELECT * FROM outbox_events')).toEqual([]);
    });

    test('deleting an owner cannot turn private tasks into shared unassigned tasks', async () => {
        await alice.post('/items').send(fields);
        // Migration 0004 dropped the foreign key: the row keeps its owner id.
        await connection.query('DELETE FROM users WHERE id = ?', [aliceId]);
        expect(await rows('SELECT user_id FROM todo_items')).toEqual([{ user_id: aliceId }]);
        expect((await bob.get('/items/unassigned')).body).toEqual([]);
    });

    test('profile returns only the authenticated account details', async () => {
        const response = await alice.get('/auth/profile?userId=' + bobId);
        expect(response.status).toBe(200);
        expect(response.body).toEqual({ user: {
            id: aliceId, email: 'alice@example.com', createdAt: expect.any(String),
        } });
        const [stored] = await connection.query<RowDataPacket[]>('SELECT created_at FROM users WHERE id = ?', [aliceId]);
        expect(response.body.user.createdAt).toBe(stored[0].created_at.toISOString());
        expect(response.headers['cache-control']).toBe('no-store');
    });

    test('account deletion removes created and claimed tasks and all sessions, preserving everyone else', async () => {
        const password = 'correct horse battery staple';
        await alice.post('/items').send(fields);
        const bobTask = await bob.post('/items').send(fields);
        await connection.query("INSERT INTO todo_items (name) VALUES ('Claimed'), ('Still unassigned')");
        const unassigned = (await alice.get('/items/unassigned')).body.filter((task: { userId: string | null }) => task.userId === null);
        await alice.post(`/items/${unassigned[0].id}/claim`).send({ projectId: aliceProject, userId: aliceId });
        const otherDevice = request.agent(app);
        await otherDevice.post('/auth/login').send({ email: 'alice@example.com', password });
        const denied = await alice.delete('/auth/me').send({ password: 'wrong' });
        expect(denied.status).toBe(403);
        expect((await alice.get('/items')).body).toHaveLength(2);
        expect((await alice.delete('/auth/me').send({ password })).status).toBe(204);
        expect((await alice.get('/auth/me')).status).toBe(401);
        expect((await otherDevice.get('/items')).status).toBe(401);
        expect((await request(app).post('/auth/login').send({ email: 'alice@example.com', password })).status).toBe(401);
        expect((await bob.get('/items')).body).toEqual([bobTask.body]);
        expect((await bob.get('/items/unassigned')).body).toEqual([ { ...bobTask.body, projectId: null }, unassigned[1] ]);
        expect((await rows('SELECT id FROM users')).map(row => row.id)).toEqual([bobId]);
        expect((await rows('SELECT user_id FROM sessions')).every(row => row.user_id === bobId)).toBe(true);
        expect(await rows('SELECT * FROM todo_items')).toHaveLength(2);
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
