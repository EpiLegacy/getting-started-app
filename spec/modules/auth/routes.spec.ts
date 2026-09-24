import http from 'http';
import express from 'express';
import request from 'supertest';
import { createAuthRouter } from '../../../src/modules/auth/routes';
import { createAuthService } from '../../../src/modules/auth/service';
import { LIMITS, createAuthThrottle, type AuthThrottle } from '../../../src/modules/auth/throttle';
import { FakeRepository, fakeHasher } from './fakes';

const ALICE = { email: 'alice@example.com', password: 'correct horse battery staple' };

/*
 * One real server per test, listening before the first request. Handing
 * supertest the bare Express app makes it open and close a server on a fresh
 * ephemeral port for every request, and under a quick burst of requests a
 * recycled port occasionally answered with something that is not HTTP
 * ("Parse Error: Expected HTTP/").
 */
const servers: http.Server[] = [];

afterEach(async () => {
    await Promise.all(servers.splice(0).map(server => new Promise(resolve => server.close(resolve))));
});

async function app({
    secureCookies = false,
    withService = true,
    throttle,
}: { secureCookies?: boolean; withService?: boolean; throttle?: AuthThrottle } = {}): Promise<http.Server> {
    let tokens = 0;
    const service = createAuthService(new FakeRepository(), {
        hasher: fakeHasher,
        newToken: () => `token-${++tokens}`,
    });
    const app = express();
    // Lets a test pick the client address with X-Forwarded-For.
    app.set('trust proxy', true);
    app.use(express.json());
    app.use('/auth', createAuthRouter(withService ? service : undefined, { secureCookies, throttle }));

    const server = http.createServer(app);
    servers.push(server);
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    return server;
}

function sessionCookie(res: request.Response): string {
    const cookies = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
    return cookies.find(cookie => cookie.startsWith('sid=')) ?? '';
}

describe('POST /auth/register', () => {
    test('answers 201 with the user and sets the session cookie', async () => {
        const res = await request(await app()).post('/auth/register').send(ALICE);

        expect(res.status).toBe(201);
        expect(res.body).toEqual({ user: { id: expect.any(String), email: 'alice@example.com' } });
        expect(sessionCookie(res)).toMatch(/^sid=token-1; Max-Age=604800; Path=\/; Expires=.+; HttpOnly; SameSite=Lax$/);
    });

    test('never returns the password or its hash', async () => {
        const res = await request(await app()).post('/auth/register').send(ALICE);

        expect(res.text).not.toContain('correct horse');
        expect(res.text).not.toContain('hashed:');
    });

    test('sets the Secure attribute when configured to', async () => {
        const res = await request(await app({ secureCookies: true })).post('/auth/register').send(ALICE);

        expect(sessionCookie(res)).toContain('; Secure');
    });

    test('answers 409 when the email already has an account', async () => {
        const server = await app();
        await request(server).post('/auth/register').send(ALICE);

        const res = await request(server).post('/auth/register').send({ ...ALICE, email: 'ALICE@example.com' });

        expect(res.status).toBe(409);
        expect(res.body).toEqual({ error: 'email_taken' });
        expect(sessionCookie(res)).toBe('');
    });

    test('answers 400 and names the fields that are wrong', async () => {
        const res = await request(await app()).post('/auth/register').send({ email: 'alice', password: 'short' });

        expect(res.status).toBe(400);
        expect(res.body.error).toBe('invalid_request');
        expect(res.body.issues.map((issue: { field: string }) => issue.field).sort()).toEqual(['email', 'password']);
    });

    test('answers 400 without a JSON body', async () => {
        const res = await request(await app()).post('/auth/register');

        expect(res.status).toBe(400);
    });
});

describe('POST /auth/login', () => {
    test('answers 200 and sets a new session cookie', async () => {
        const server = await app();
        await request(server).post('/auth/register').send(ALICE);

        const res = await request(server).post('/auth/login').send(ALICE);

        expect(res.status).toBe(200);
        expect(res.body).toEqual({ user: { id: expect.any(String), email: 'alice@example.com' } });
        expect(sessionCookie(res)).toMatch(/^sid=token-2;/);
    });

    test('answers an unknown email and a wrong password with the same 401', async () => {
        const server = await app();
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
        const res = await request(await app()).get('/auth/me');

        expect(res.status).toBe(401);
        expect(res.body).toEqual({ error: 'unauthenticated' });
    });

    test('/me answers 401 with a cookie that matches no session', async () => {
        const res = await request(await app()).get('/auth/me').set('Cookie', 'sid=forged');

        expect(res.status).toBe(401);
    });

    test('/me returns the signed-in user, and nothing works after logging out', async () => {
        const agent = request.agent(await app());
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
        const res = await request(await app()).post('/auth/logout');

        expect(res.status).toBe(204);
    });
});

test('no auth response may be stored by a cache', async () => {
    const res = await request(await app()).get('/auth/me');

    expect(res.headers['cache-control']).toBe('no-store');
});

test('without MySQL, every auth route answers 503 instead of pretending to work', async () => {
    const server = await app({ withService: false });

    for (const res of [
        await request(server).post('/auth/register').send(ALICE),
        await request(server).post('/auth/login').send(ALICE),
        await request(server).get('/auth/me'),
    ]) {
        expect(res.status).toBe(503);
        expect(res.body.error).toBe('auth_unavailable');
    }
});

describe('profile and self-service account deletion', () => {
    test('profile is private and contains no credentials', async () => {
        const server = await app();
        expect((await request(server).get('/auth/profile')).status).toBe(401);
        const agent = request.agent(server);
        const registered = await agent.post('/auth/register').send(ALICE);
        const profile = await agent.get('/auth/profile?userId=someone-else');
        expect(profile.status).toBe(200);
        expect(profile.headers['cache-control']).toBe('no-store');
        expect(profile.body).toEqual({ user: { ...registered.body.user, createdAt: expect.any(String) } });
        expect(Number.isNaN(Date.parse(profile.body.user.createdAt))).toBe(false);
        expect(profile.text).not.toContain('password');
    });

    test('deletion needs a session and correct password and rejects supplied account ids', async () => {
        const server = await app();
        expect((await request(server).delete('/auth/me').send({ password: ALICE.password })).status).toBe(401);
        const agent = request.agent(server);
        await agent.post('/auth/register').send(ALICE);
        expect((await agent.delete('/auth/me').send({})).status).toBe(400);
        expect((await agent.delete('/auth/me').send({ password: ALICE.password, userId: 'other' })).status).toBe(400);
        const wrong = await agent.delete('/auth/me').send({ password: 'wrong' });
        expect(wrong.status).toBe(403);
        expect(wrong.body).toEqual({ error: 'invalid_password' });
        expect(sessionCookie(wrong)).toBe('');
        expect((await agent.get('/auth/me')).status).toBe(200);
    });

    test('deletes only the signed-in account, clears its cookie, and revokes all sessions', async () => {
        const server = await app();
        const alice = request.agent(server);
        const secondSession = request.agent(server);
        const bob = request.agent(server);
        await alice.post('/auth/register').send(ALICE);
        await secondSession.post('/auth/login').send(ALICE);
        await bob.post('/auth/register').send({ ...ALICE, email: 'bob@example.com' });
        const deleted = await alice.delete('/auth/me').send({ password: ALICE.password });
        expect(deleted.status).toBe(204);
        expect(sessionCookie(deleted)).toMatch(/^sid=; Path=\/; Expires=Thu, 01 Jan 1970/);
        expect((await alice.get('/auth/me')).status).toBe(401);
        expect((await secondSession.get('/auth/profile')).status).toBe(401);
        expect((await request(server).post('/auth/login').send(ALICE)).status).toBe(401);
        expect((await bob.get('/auth/profile')).body.user.email).toBe('bob@example.com');
    });
});

test('profile returns an expired-session response if the account disappears after authentication', async () => {
    const repository = new FakeRepository();
    const service = createAuthService(repository, { hasher: fakeHasher });
    const server = express().use(express.json()).use('/auth', createAuthRouter(service, { secureCookies: false }));
    const agent = request.agent(server);
    await agent.post('/auth/register').send(ALICE);
    jest.spyOn(repository, 'findUserById').mockResolvedValueOnce(undefined);
    const profile = await agent.get('/auth/profile');
    expect(profile.status).toBe(401);
    expect(profile.body).toEqual({ error: 'unauthenticated' });
    expect(profile.text).not.toContain(ALICE.email);
});

describe('attempt limits', () => {
    const WRONG = { ...ALICE, password: 'not the right one' };
    let now: number;
    let server: http.Server;

    const login = (body: object, ip = '203.0.113.1') =>
        request(server).post('/auth/login').set('X-Forwarded-For', ip).send(body);

    beforeEach(async () => {
        now = Date.parse('2026-09-23T10:00:00Z');
        server = await app({ throttle: createAuthThrottle(() => now) });
        // From another address, so the registration does not count against the tests.
        await request(server).post('/auth/register').set('X-Forwarded-For', '198.51.100.9').send(ALICE);
        fakeHasher.verify.mockClear();
    });

    test('a sixth guess at one account is refused, even with the right password', async () => {
        for (let i = 0; i < 5; i++) expect((await login(WRONG)).status).toBe(401);

        const res = await login(ALICE);

        expect(res.status).toBe(429);
        expect(res.body).toEqual({ error: 'too_many_attempts' });
        expect(res.headers['retry-after']).toBe('900');
        expect(sessionCookie(res)).toBe('');
    });

    test('a refused attempt does not even check the password', async () => {
        for (let i = 0; i < 5; i++) await login(WRONG);
        fakeHasher.verify.mockClear();

        await login(ALICE);

        expect(fakeHasher.verify).not.toHaveBeenCalled();
    });

    test('guessing from one address cannot lock the owner out from another', async () => {
        for (let i = 0; i < 5; i++) await login(WRONG, '203.0.113.1');

        expect((await login(ALICE, '203.0.113.2')).status).toBe(200);
    });

    test('the account may try again once the window has passed', async () => {
        for (let i = 0; i < 5; i++) await login(WRONG);

        now += 15 * 60 * 1000;

        expect((await login(ALICE)).status).toBe(200);
    });

    test('an email differing only in case shares the same count', async () => {
        for (let i = 0; i < 5; i++) await login({ ...WRONG, email: i % 2 ? 'ALICE@example.com' : 'alice@EXAMPLE.com' });

        expect((await login(ALICE)).status).toBe(429);
    });

    test('a successful login clears the count for that account', async () => {
        for (let i = 0; i < 4; i++) await login(WRONG);
        expect((await login(ALICE)).status).toBe(200);

        for (let i = 0; i < 5; i++) expect((await login(WRONG)).status).toBe(401);
        expect((await login(WRONG)).status).toBe(429);
    });

    test('one address trying many accounts is stopped after 100 failures', async () => {
        for (let i = 0; i < 100; i++) {
            expect((await login({ ...WRONG, email: `user${i}@example.com` })).status).toBe(401);
        }

        expect((await login(ALICE)).status).toBe(429);
    });

    test('successful logins do not use up the address budget', async () => {
        for (let i = 0; i < 105; i++) expect((await login(ALICE)).status).toBe(200);
    });

    test('concurrent guesses cannot get past the limit', async () => {
        const answers = await Promise.all(Array.from({ length: 10 }, () => login(WRONG)));
        const statuses = answers.map(res => res.status).sort();

        expect(statuses).toEqual([401, 401, 401, 401, 401, 429, 429, 429, 429, 429]);
    });

    test('an address may start 50 registrations an hour', async () => {
        const register = (i: number) =>
            request(server)
                .post('/auth/register')
                .set('X-Forwarded-For', '203.0.113.7')
                .send({ ...ALICE, email: `new${i}@example.com` });

        for (let i = 0; i < 50; i++) expect((await register(i)).status).toBe(201);

        const res = await register(50);
        expect(res.status).toBe(429);
        expect(res.headers['retry-after']).toBe('3600');
    });

    test('a malformed registration is answered 400 and not counted', async () => {
        for (let i = 0; i < 55; i++) {
            const res = await request(server)
                .post('/auth/register')
                .set('X-Forwarded-For', '203.0.113.8')
                .send({ email: 'nope', password: 'short' });
            expect(res.status).toBe(400);
        }

        const res = await request(server)
            .post('/auth/register')
            .set('X-Forwarded-For', '203.0.113.8')
            .send({ ...ALICE, email: 'fresh@example.com' });
        expect(res.status).toBe(201);
    });
});

test('a shared network keeps a usable budget: the limits per address are loose', () => {
    expect(LIMITS.loginPerAccount).toEqual({ limit: 5, windowMs: 15 * 60 * 1000 });
    expect(LIMITS.loginPerIp.limit).toBeGreaterThanOrEqual(100);
    expect(LIMITS.registerPerIp.limit).toBeGreaterThanOrEqual(50);
});
