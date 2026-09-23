import { SESSION_TTL_MS, createAuthService } from '../../../src/modules/auth/service';
import { hashSessionToken } from '../../../src/modules/auth/tokens';
import { FakeRepository, fakeHasher } from './fakes';

const NOW = new Date('2026-09-23T10:00:00.000Z');
const ALICE = { email: 'alice@example.com', password: 'correct horse battery staple' };

let repository: FakeRepository;
let now: Date;
let tokens: number;

function service() {
    return createAuthService(repository, {
        hasher: fakeHasher,
        now: () => now,
        newUserId: () => 'user-1',
        newToken: () => `token-${++tokens}`,
    });
}

beforeEach(() => {
    repository = new FakeRepository();
    now = NOW;
    tokens = 0;
});

describe('register', () => {
    test('creates the account and signs it in', async () => {
        const result = await service().register(ALICE);

        expect(result).toEqual({
            kind: 'created',
            user: { id: 'user-1', email: 'alice@example.com' },
            token: 'token-1',
            expiresAt: new Date(NOW.getTime() + SESSION_TTL_MS),
        });
    });

    test('stores the password hash, never the password', async () => {
        await service().register(ALICE);

        expect(repository.users[0]).toEqual({
            id: 'user-1',
            email: 'alice@example.com',
            passwordHash: 'hashed:correct horse battery staple',
            createdAt: NOW,
        });
    });

    test('stores the SHA-256 of the session token, never the token', async () => {
        await service().register(ALICE);

        expect(repository.sessions).toEqual([
            {
                id: hashSessionToken('token-1'),
                userId: 'user-1',
                createdAt: NOW,
                expiresAt: new Date(NOW.getTime() + SESSION_TTL_MS),
            },
        ]);
    });

    test('refuses an email that already has an account', async () => {
        await service().register(ALICE);

        expect(await service().register(ALICE)).toEqual({ kind: 'email_taken' });
        expect(repository.users).toHaveLength(1);
    });
});

describe('login', () => {
    beforeEach(async () => {
        await service().register(ALICE);
        fakeHasher.verify.mockClear();
    });

    test('opens a new session with the right password', async () => {
        const result = await service().login(ALICE);

        expect(result).toEqual({
            kind: 'signed_in',
            user: { id: 'user-1', email: 'alice@example.com' },
            token: 'token-2',
            expiresAt: new Date(NOW.getTime() + SESSION_TTL_MS),
        });
        expect(repository.sessions).toHaveLength(2);
    });

    test('refuses a wrong password without opening a session', async () => {
        const result = await service().login({ ...ALICE, password: 'wrong password' });

        expect(result).toEqual({ kind: 'invalid_credentials' });
        expect(repository.sessions).toHaveLength(1);
    });

    test('answers an unknown email exactly like a wrong password', async () => {
        const result = await service().login({ ...ALICE, email: 'nobody@example.com' });

        expect(result).toEqual({ kind: 'invalid_credentials' });
    });

    test('still verifies a password for an unknown email, so the timing gives nothing away', async () => {
        await service().login({ ...ALICE, email: 'nobody@example.com' });

        expect(fakeHasher.verify).toHaveBeenCalledTimes(1);
    });
});

describe('authenticate and logout', () => {
    test('a session token identifies its user', async () => {
        await service().register(ALICE);

        expect(await service().authenticate('token-1')).toEqual({ id: 'user-1', email: 'alice@example.com' });
    });

    test('an unknown token identifies nobody', async () => {
        await service().register(ALICE);

        expect(await service().authenticate('token-999')).toBeUndefined();
    });

    test('a session stops working when it expires', async () => {
        await service().register(ALICE);

        now = new Date(NOW.getTime() + SESSION_TTL_MS - 1);
        expect(await service().authenticate('token-1')).toBeDefined();

        now = new Date(NOW.getTime() + SESSION_TTL_MS);
        expect(await service().authenticate('token-1')).toBeUndefined();
    });

    test('logging out ends that session and no other', async () => {
        await service().register(ALICE);
        await service().login(ALICE);

        await service().logout('token-1');

        expect(await service().authenticate('token-1')).toBeUndefined();
        expect(await service().authenticate('token-2')).toBeDefined();
    });
});

describe('purgeExpiredSessions', () => {
    test('deletes the expired sessions only, and says how many', async () => {
        await service().register(ALICE);
        now = new Date(NOW.getTime() + 60_000);
        await service().login(ALICE);

        now = new Date(NOW.getTime() + SESSION_TTL_MS);
        expect(await service().purgeExpiredSessions()).toBe(1);

        expect(repository.sessions).toHaveLength(1);
        expect(await service().authenticate('token-2')).toBeDefined();
    });

    test('a session expiring exactly now is purged, like it is refused', async () => {
        await service().register(ALICE);
        now = new Date(NOW.getTime() + SESSION_TTL_MS);

        expect(await service().authenticate('token-1')).toBeUndefined();
        expect(await service().purgeExpiredSessions()).toBe(1);
    });
});
