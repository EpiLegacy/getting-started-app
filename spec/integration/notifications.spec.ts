import type { Server } from 'node:http';
import type { Connection, RowDataPacket } from 'mysql2/promise';
import request from 'supertest';
import { init, teardown } from '../../src/infrastructure/db/drizzle';
import { createEvent } from '../../src/shared/events/envelope';
import { TASK_COMPLETED, eventCatalog } from '../../src/shared/events/catalog';
import { handleTaskEvent } from '../../src/workers/notifications/handler.drizzle';
import { closeServers, listen } from '../support/server';
import { createApp } from './support/app';
import { connect } from './support/database';

/*
 * The bell's API against MySQL 8.4, fed by the worker's own handler: what the
 * event-driven workflow stores is what the signed-in user sees.
 */
const password = 'correct horse battery staple';
let app: Server;
let connection: Connection;
let alice: ReturnType<typeof request.agent>;
let bob: ReturnType<typeof request.agent>;
let aliceId: string;
let bobId: string;

async function notify(recipientId: string, body: string, createdAt: Date): Promise<void> {
    await connection.query(
        "INSERT INTO notifications (id, recipient_id, type, body, created_at) VALUES (UUID(), ?, 'task.completed', ?, ?)",
        [recipientId, body, createdAt],
    );
}

beforeAll(async () => {
    connection = await connect();
    await init();
    app = await listen(createApp());
});

beforeEach(async () => {
    await connection.query('DELETE FROM notifications');
    await connection.query('DELETE FROM processed_events');
    await connection.query('DELETE FROM users');
    alice = request.agent(app);
    bob = request.agent(app);
    aliceId = (await alice.post('/auth/register').send({ email: 'alice@example.com', password })).body.user.id;
    bobId = (await bob.post('/auth/register').send({ email: 'bob@example.com', password })).body.user.id;
});

afterAll(async () => {
    await closeServers();
    await teardown();
    await connection?.end();
});

test('notifications need a session', async () => {
    expect((await request(app).get('/notifications')).status).toBe(401);
    expect((await request(app).post('/notifications/read')).status).toBe(401);
});

test('a completed task reaches its owner\'s bell through the worker\'s handler', async () => {
    const event = createEvent({
        type: TASK_COMPLETED,
        version: eventCatalog[TASK_COMPLETED].version,
        aggregateId: '42',
        payload: { taskId: '42', name: 'Ship it', completedAt: new Date().toISOString() },
        correlationId: 'demo',
        actorId: aliceId,
    });
    expect(await handleTaskEvent(event)).toBe('applied');

    const feed = (await alice.get('/notifications')).body;
    expect(feed.unread).toBe(1);
    expect(feed.notifications).toEqual([expect.objectContaining({ type: TASK_COMPLETED, body: 'Task "Ship it" moved to Done', read: false })]);
    expect((await bob.get('/notifications')).body).toEqual({ notifications: [], unread: 0 });
});

test('each user sees only their own notifications, newest first, and marks only those as read', async () => {
    await notify(aliceId, 'Older', new Date('2026-10-02T08:00:00Z'));
    await notify(aliceId, 'Newer', new Date('2026-10-02T09:00:00Z'));
    await notify(bobId, 'For Bob', new Date('2026-10-02T08:30:00Z'));

    const before = (await alice.get('/notifications')).body;
    expect(before.unread).toBe(2);
    expect(before.notifications.map((n: { body: string }) => n.body)).toEqual(['Newer', 'Older']);

    expect((await alice.post('/notifications/read')).status).toBe(204);
    const after = (await alice.get('/notifications')).body;
    expect(after.unread).toBe(0);
    expect(after.notifications.every((n: { read: boolean }) => n.read)).toBe(true);
    expect((await bob.get('/notifications')).body.unread).toBe(1);
});

test('account deletion removes the user\'s notifications and keeps everyone else\'s', async () => {
    await notify(aliceId, 'For Alice', new Date());
    await notify(bobId, 'For Bob', new Date());
    expect((await alice.delete('/auth/me').send({ password })).status).toBe(204);
    const [remaining] = await connection.query<RowDataPacket[]>('SELECT recipient_id FROM notifications');
    expect(remaining).toEqual([{ recipient_id: bobId }]);
});
