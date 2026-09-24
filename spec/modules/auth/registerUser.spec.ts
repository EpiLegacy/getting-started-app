/**
 * Unit tests for the registerUser application use-case.
 *
 * Uses a hand-rolled in-memory UserRepository so neither a database nor
 * the Argon2 native module are required — Jest mocks @node-rs/argon2.
 */

import type { UserRecord, UserRepository } from '../../../src/modules/auth/infrastructure/userRepository';
import { registerUser } from '../../../src/modules/auth/application/registerUser';

// ---------------------------------------------------------------------------
// Mock @node-rs/argon2 — no native binary needed in the test environment
// ---------------------------------------------------------------------------

jest.mock('@node-rs/argon2', () => ({
    hash: jest.fn().mockResolvedValue('hashed_password'),
    verify: jest.fn(),
}));

// Also mock uuid so IDs are deterministic.
jest.mock('uuid', () => ({ v4: () => 'test-uuid' }));

// ---------------------------------------------------------------------------
// In-memory repository factory
// ---------------------------------------------------------------------------

function makeInMemoryRepo(existingUsers: UserRecord[] = []): UserRepository {
    const store: UserRecord[] = [...existingUsers];
    return {
        findByEmail: (email: string) =>
            Promise.resolve(store.find(u => u.email === email)),
        insert: (user: UserRecord) => {
            store.push(user);
            return Promise.resolve();
        },
    };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const VALID_INPUT = { email: 'test@example.com', password: 'P@ssw0rd1!' };

describe('registerUser', () => {
    test('succeeds with valid input', async () => {
        const repo = makeInMemoryRepo();
        const result = await registerUser(VALID_INPUT, repo);

        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.user.email).toBe('test@example.com');
            expect(result.user.id).toBe('test-uuid');
        }
    });

    test('normalises email to lowercase', async () => {
        const repo = makeInMemoryRepo();
        const result = await registerUser(
            { email: 'UPPER@EXAMPLE.COM', password: 'P@ssw0rd1!' },
            repo,
        );
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.user.email).toBe('upper@example.com');
        }
    });

    test('rejects invalid email', async () => {
        const repo = makeInMemoryRepo();
        const result = await registerUser({ email: 'not-an-email', password: 'P@ssw0rd1!' }, repo);

        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.reason).toBe('Validation failed');
        }
    });

    test('rejects password without uppercase', async () => {
        const repo = makeInMemoryRepo();
        const result = await registerUser({ email: 'a@b.com', password: 'p@ssw0rd1!' }, repo);
        expect(result.ok).toBe(false);
    });

    test('rejects password without digit', async () => {
        const repo = makeInMemoryRepo();
        const result = await registerUser({ email: 'a@b.com', password: 'P@ssword!' }, repo);
        expect(result.ok).toBe(false);
    });

    test('rejects password without special character', async () => {
        const repo = makeInMemoryRepo();
        const result = await registerUser({ email: 'a@b.com', password: 'Passw0rd1' }, repo);
        expect(result.ok).toBe(false);
    });

    test('rejects password shorter than 8 chars', async () => {
        const repo = makeInMemoryRepo();
        const result = await registerUser({ email: 'a@b.com', password: 'P@1!' }, repo);
        expect(result.ok).toBe(false);
    });

    test('rejects duplicate email with generic message', async () => {
        const existing: UserRecord = {
            id: 'existing-id',
            email: 'test@example.com',
            password_hash: 'x',
            created_at: new Date().toISOString(),
        };
        const repo = makeInMemoryRepo([existing]);
        const result = await registerUser(VALID_INPUT, repo);

        expect(result.ok).toBe(false);
        if (!result.ok) {
            // Must NOT say "email already registered" — that leaks enumeration
            expect(result.reason).not.toMatch(/email|already|exists|registered/i);
        }
    });
});
