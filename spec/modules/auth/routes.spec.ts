import express from 'express';
import request from 'supertest';
import { createAuthRouter } from '../../../src/modules/auth/routes';
import { createAuthService } from '../../../src/modules/auth/service';
import { FakeRepository, fakeHasher } from './fakes';

const ALICE = { email: 'alice@example.com', password: 'correct horse battery staple' };

function app({ secureCookies = false, withService = true } = {}) {
    let tokens = 0;
    const service = createAuthService(new FakeRepository(), {
        hasher: fakeHasher,
        newToken: () => `token-${++tokens}`,
    });
    const app = express();
    app.use(express.json());
    app.use('/auth', createAuthRouter(withService ? service : undefined, { secureCookies }));
    return app;
}

function sessionCookie(res: request.Response): string {
    const cookies = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
    return cookies.find(cookie => cookie.startsWith('sid=')) ?? '';
}

describe('POST /auth/register', () => {
    test('answers 201 with the user and sets the session cookie', async () => {
        const res = await request(app()).post('/auth/register').send(ALICE);

        expect(res.status).toBe(201);
        expect(res.body).toEqual({ user: { id: expect.any(String), email: 'alice@example.com' } });
        expect(sessionCookie(res)).toMatch(/^sid=token-1; Max-Age=604800; Path=\/; Expires=.+; HttpOnly; SameSite=Lax$/);
    });

    test('never returns the password or its hash', async () => {
        const res = await request(app()).post('/auth/register').send(ALICE);

        expect(res.text).not.toContain('correct horse');
        expect(res.text).not.toContain('hashed:');
    });

    test('sets the Secure attribute when configured to', async () => {
        const res = await request(app({ secureCookies: true })).post('/auth/register').send(ALICE);

        expect(sessionCookie(res)).toContain('; Secure');
    });

    test('answers 409 when the email already has an account', async () => {
        const server = app();
        await request(server).post('/auth/register').send(ALICE);

        const res = await request(server).post('/auth/register').send({ ...ALICE, email: 'ALICE@example.com' });

        expect(res.status).toBe(409);
        expect(res.body).toEqual({ error: 'email_taken' });
        expect(sessionCookie(res)).toBe('');
    });

    test('answers 400 and names the fields that are wrong', async () => {
        const res = await request(app()).post('/auth/register').send({ email: 'alice', password: 'short' });

        expect(res.status).toBe(400);
        expect(res.body.error).toBe('invalid_request');
        expect(res.body.issues.map((issue: { field: string }) => issue.field).sort()).toEqual(['email', 'password']);
    });

    test('answers 400 without a JSON body', async () => {
        const res = await request(app()).post('/auth/register');

        expect(res.status).toBe(400);
    });
});

describe('POST /auth/login', () => {
    test('answers 200 and sets a new session cookie', async () => {
        const server = app();
        await request(server).post('/auth/register').send(ALICE);

        const res = await request(server).post('/auth/login').send(ALICE);

        expect(res.status).toBe(200);
        expect(res.body).toEqual({ user: { id: expect.any(String), email: 'alice@example.com' } });
        expect(sessionCookie(res)).toMatch(/^sid=token-2;/);
    });

    test('answers an unknown email and a wrong password with the same 401', async () => {
        const server = app();
        await request(server).post('/auth/register').send(ALICE);

        const wrongPassword = await request(server).post('/auth/login').send({ ...ALICE, password: 'not the one' });
        const unknownEmail = await request(server).post('/auth/login').send({ ...ALICE, email: 'bob@example.com' });

        for (const res of [wrongPassword, unknownEmail]) {
            expect(res.status).toBe(401);
            expect(res.body).toEqual({ error: 'invalid_credentials' });
            expect(sessionCookie(res)).toBe('');
        }
    });
});

describe('GET /auth/me and POST /auth/logout', () => {
    test('/me answers 401 without a session cookie', async () => {
        const res = await request(app()).get('/auth/me');

        expect(res.status).toBe(401);
        expect(res.body).toEqual({ error: 'unauthenticated' });
    });

    test('/me answers 401 with a cookie that matches no session', async () => {
        const res = await request(app()).get('/auth/me').set('Cookie', 'sid=forged');

        expect(res.status).toBe(401);
    });

    test('/me returns the signed-in user, and nothing works after logging out', async () => {
        const agent = request.agent(app());
        await agent.post('/auth/register').send(ALICE);

        const me = await agent.get('/auth/me');
        expect(me.status).toBe(200);
        expect(me.body).toEqual({ user: { id: expect.any(String), email: 'alice@example.com' } });

        const logout = await agent.post('/auth/logout');
        expect(logout.status).toBe(204);
        expect(sessionCookie(logout)).toMatch(/^sid=; Path=\/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax$/);

        expect((await agent.get('/auth/me')).status).toBe(401);
    });

    test('logging out without a session still answers 204', async () => {
        const res = await request(app()).post('/auth/logout');

        expect(res.status).toBe(204);
    });
});

test('no auth response may be stored by a cache', async () => {
    const res = await request(app()).get('/auth/me');

    expect(res.headers['cache-control']).toBe('no-store');
});

test('without MySQL, every auth route answers 503 instead of pretending to work', async () => {
    const server = app({ withService: false });

    for (const res of [
        await request(server).post('/auth/register').send(ALICE),
        await request(server).post('/auth/login').send(ALICE),
        await request(server).get('/auth/me'),
    ]) {
        expect(res.status).toBe(503);
        expect(res.body.error).toBe('auth_unavailable');
    }
});
