/**
 * Unit tests for the loginUser application use-case.
 *
 * Verifies correct credentials, bad password, non-existent user, and — most
 * importantly — that the error message is identical in all failure cases
 * (anti-enumeration) and that Argon2 verify is ALWAYS called (anti-timing).
 */

import type { UserRecord, UserRepository } from '../../../src/modules/auth/infrastructure/userRepository';
import { loginUser } from '../../../src/modules/auth/application/loginUser';

import { verify } from '@node-rs/argon2';

jest.mock('@node-rs/argon2', () => ({
    hash: jest.fn().mockResolvedValue('sentinel_hash_value'),
    verify: jest.fn(),
}));

const mockVerify = verify as unknown as jest.Mock;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STORED_USER: UserRecord = {
    id: 'user-id-1',
    email: 'alice@example.com',
    password_hash: 'argon2id$real_hash',
    created_at: '2026-01-01T00:00:00.000Z',
};

function makeRepo(user?: UserRecord): UserRepository {
    return {
        findByEmail: (email: string) =>
            Promise.resolve(user?.email === email ? user : undefined),
        insert: jest.fn(),
    };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('loginUser', () => {
    test('succeeds with correct credentials', async () => {
        mockVerify.mockResolvedValueOnce(true);
        const result = await loginUser(
            { email: 'alice@example.com', password: 'correct_password' },
            makeRepo(STORED_USER),
        );

        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.user.id).toBe('user-id-1');
            expect(result.user.email).toBe('alice@example.com');
        }
    });

    test('fails with wrong password', async () => {
        mockVerify.mockResolvedValueOnce(false);
        const result = await loginUser(
            { email: 'alice@example.com', password: 'wrong_password' },
            makeRepo(STORED_USER),
        );

        expect(result.ok).toBe(false);
    });

    test('fails when user does not exist', async () => {
        mockVerify.mockResolvedValueOnce(false);
        const result = await loginUser(
            { email: 'nobody@example.com', password: 'any_password' },
            makeRepo(), // empty repo
        );

        expect(result.ok).toBe(false);
    });

    test('error message is identical for wrong password vs unknown user (anti-enumeration)', async () => {
        mockVerify.mockResolvedValue(false);

        const wrongPassword = await loginUser(
            { email: 'alice@example.com', password: 'wrong' },
            makeRepo(STORED_USER),
        );
        const unknownUser = await loginUser(
            { email: 'nobody@example.com', password: 'wrong' },
            makeRepo(),
        );

        expect(wrongPassword.ok).toBe(false);
        expect(unknownUser.ok).toBe(false);
        if (!wrongPassword.ok && !unknownUser.ok) {
            expect(wrongPassword.reason).toBe(unknownUser.reason);
        }
    });

    test('always calls argon2 verify even when user does not exist (anti-timing)', async () => {
        mockVerify.mockResolvedValueOnce(false);
        await loginUser(
            { email: 'nobody@example.com', password: 'any_password' },
            makeRepo(), // empty repo
        );

        // verify() must have been called once regardless of user existence
        expect(mockVerify).toHaveBeenCalledTimes(1);
    });

    test('normalises email before lookup', async () => {
        mockVerify.mockResolvedValueOnce(true);
        const result = await loginUser(
            { email: 'ALICE@EXAMPLE.COM', password: 'correct_password' },
            makeRepo(STORED_USER),
        );

        expect(result.ok).toBe(true);
    });

    test('rejects completely invalid input', async () => {
        const result = await loginUser({ email: 'not-an-email' }, makeRepo());
        expect(result.ok).toBe(false);
        if (!result.ok) {
            // Must return generic credentials error, not a validation detail
            expect(result.reason).toBe('Invalid credentials');
        }
    });
});
