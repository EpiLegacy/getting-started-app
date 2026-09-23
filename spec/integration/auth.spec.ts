import fs from 'fs';
import path from 'path';
import type { Connection, RowDataPacket } from 'mysql2/promise';
import request from 'supertest';
import { init as initDrizzlePool, teardown as teardownDrizzlePool } from '../../src/infrastructure/db/drizzle';
import { hashSessionToken } from '../../src/modules/auth/tokens';
import { createApp } from './support/app';
import { connect, dropTables, showCreateTable } from './support/database';

/*
 * The auth routes against a real MySQL 8.4, with the tables created by the
 * migration file itself: what is tested is what `npm run db:migrate` would
 * apply, not a copy of it.
 */

// Children first: sessions references users.
const AUTH_TABLES = ['sessions', 'users'];
const MIGRATION = path.join(__dirname, '../../drizzle/0001_auth.sql');
const ALICE = { email: 'alice@example.com', password: 'correct horse battery staple' };

// A fresh application per test: the attempt limits are held in memory, and
// every request here comes from the same address.
let app: ReturnType<typeof createApp>;
let connection: Connection;

async function applyMigration(): Promise<void> {
    const statements = fs
        .readFileSync(MIGRATION, 'utf8')
        .split('--> statement-breakpoint')
        .map(statement => statement.trim())
        .filter(Boolean);
    for (const statement of statements) await connection.query(statement);
}

async function rows(sql: string, params: unknown[] = []): Promise<RowDataPacket[]> {
    const [result] = await connection.query<RowDataPacket[]>(sql, params);
    return result;
}

function sessionToken(res: request.Response): string {
    const cookie = ([] as string[]).concat(res.headers['set-cookie'] ?? []).find(c => c.startsWith('sid='));
    return cookie ? cookie.slice('sid='.length, cookie.indexOf(';')) : '';
}

beforeAll(async () => {
    connection = await connect();
    await dropTables(connection, AUTH_TABLES);
    await applyMigration();
    await initDrizzlePool();
});

beforeEach(async () => {
    app = createApp();
    await connection.query('DELETE FROM sessions');
    await connection.query('DELETE FROM users');
});

afterAll(async () => {
    await dropTables(connection, AUTH_TABLES);
    await connection?.end();
    await teardownDrizzlePool();
});

describe('migration 0001', () => {
    test('creates users with a unique email', async () => {
        const ddl = await showCreateTable(connection, 'users');

        expect(ddl).toContain('PRIMARY KEY (`id`)');
        expect(ddl).toContain('UNIQUE KEY `uq_users_email` (`email`)');
    });

    test("deletes a user's sessions with the user", async () => {
        const ddl = await showCreateTable(connection, 'sessions');

        expect(ddl).toContain(
            'CONSTRAINT `sessions_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE',
        );
    });
});

test('register, read the session, log out: the whole round trip', async () => {
    const agent = request.agent(app);

    const registered = await agent.post('/auth/register').send(ALICE);
    expect(registered.status).toBe(201);

    const me = await agent.get('/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.user).toEqual({ id: registered.body.user.id, email: 'alice@example.com' });

    expect((await agent.post('/auth/logout')).status).toBe(204);
    expect((await agent.get('/auth/me')).status).toBe(401);
    expect(await rows('SELECT * FROM sessions')).toHaveLength(0);
});

test('the database holds neither the password nor the session token', async () => {
    const res = await request(app).post('/auth/register').send(ALICE);
    const token = sessionToken(res);

    const [user] = await rows('SELECT password_hash FROM users');
    expect(user.password_hash).toMatch(/^scrypt\$131072\$8\$1\$/);
    expect(user.password_hash).not.toContain(ALICE.password);

    const [session] = await rows('SELECT id FROM sessions');
    expect(session.id).toBe(hashSessionToken(token));
    expect(session.id).not.toBe(token);
});

test('logging in with the password chosen at registration opens a second session', async () => {
    await request(app).post('/auth/register').send(ALICE);

    const res = await request(app).post('/auth/login').send({ ...ALICE, email: ' ALICE@Example.com' });

    expect(res.status).toBe(200);
    expect(await rows('SELECT * FROM sessions')).toHaveLength(2);
});

test('a wrong password is refused', async () => {
    await request(app).post('/auth/register').send(ALICE);

    const res = await request(app).post('/auth/login').send({ ...ALICE, password: 'not the right one' });

    expect(res.status).toBe(401);
});

test('after five wrong passwords, even the right one is refused for a while', async () => {
    await request(app).post('/auth/register').send(ALICE);

    for (let i = 0; i < 5; i++) {
        expect((await request(app).post('/auth/login').send({ ...ALICE, password: 'not the right one' })).status).toBe(401);
    }
    const res = await request(app).post('/auth/login').send(ALICE);

    expect(res.status).toBe(429);
    // Counted from the first failure, which real hashing put a moment ago.
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(850);
    expect(Number(res.headers['retry-after'])).toBeLessThanOrEqual(900);
    // Registration opened one session; the refused login opened none.
    expect(await rows('SELECT * FROM sessions')).toHaveLength(1);
});

test('an email differing only in case is the same account', async () => {
    await request(app).post('/auth/register').send(ALICE);

    const res = await request(app).post('/auth/register').send({ ...ALICE, email: 'Alice@EXAMPLE.com' });

    expect(res.status).toBe(409);
    expect(await rows('SELECT * FROM users')).toHaveLength(1);
});

test('two simultaneous registrations of one email create one account', async () => {
    const answers = await Promise.all([
        request(app).post('/auth/register').send(ALICE),
        request(app).post('/auth/register').send(ALICE),
    ]);

    expect(answers.map(res => res.status).sort()).toEqual([201, 409]);
    expect(await rows('SELECT * FROM users')).toHaveLength(1);
    // The losing request's session was rolled back with its user.
    expect(await rows('SELECT * FROM sessions')).toHaveLength(1);
});

test('an expired session is refused', async () => {
    const agent = request.agent(app);
    await agent.post('/auth/register').send(ALICE);

    await connection.query('UPDATE sessions SET expires_at = ?', [new Date(Date.now() - 1000)]);

    expect((await agent.get('/auth/me')).status).toBe(401);
});

test("deleting a user ends the user's sessions", async () => {
    const agent = request.agent(app);
    await agent.post('/auth/register').send(ALICE);

    await connection.query('DELETE FROM users');

    expect(await rows('SELECT * FROM sessions')).toHaveLength(0);
    expect((await agent.get('/auth/me')).status).toBe(401);
});
