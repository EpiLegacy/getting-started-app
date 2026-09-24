/**
 * loginUser — application use-case.
 *
 * Validates input, looks up the user, and verifies the password with Argon2id.
 *
 * Timing-attack mitigation strategy:
 *   A naive implementation that returns early on "user not found" would be
 *   measurably faster than the "wrong password" path (which runs Argon2).
 *   An attacker timing many requests could enumerate valid e-mail addresses.
 *
 *   Here we ALWAYS run Argon2 verify — against the real hash when the user
 *   exists, or against a pre-computed sentinel hash when they do not. The
 *   sentinel is created once at module load so the timing profile of both
 *   paths is identical.
 */

import { z } from 'zod';
import { hash, verify } from '@node-rs/argon2';
import type { UserRepository } from '../infrastructure/userRepository';

// ---------------------------------------------------------------------------
// Input validation schema
// ---------------------------------------------------------------------------

export const loginSchema = z.object({
    email: z.string().trim().toLowerCase().email(),
    password: z.string().min(1, 'Password is required'),
});

export type LoginInput = z.infer<typeof loginSchema>;

// ---------------------------------------------------------------------------
// Output types
// ---------------------------------------------------------------------------

export interface LoginSuccess {
    ok: true;
    user: { id: string; email: string };
}

export interface LoginFailure {
    ok: false;
    reason: string;
}

export type LoginResult = LoginSuccess | LoginFailure;

// ---------------------------------------------------------------------------
// Sentinel hash — computed once at startup
// ---------------------------------------------------------------------------

/**
 * A constant-time dummy to hash against when the requested user does not exist.
 * This ensures the code always runs Argon2 verify, making the "not found" and
 * "wrong password" paths indistinguishable by timing.
 */
let sentinelHash: string | undefined;

async function getSentinelHash(): Promise<string> {
    if (!sentinelHash) {
        sentinelHash = await hash('__sentinel__', {
            memoryCost: 19456,
            timeCost: 2,
            parallelism: 1,
        });
    }
    return sentinelHash as string;
}

// Pre-warm the sentinel at module load so the first login is not slower.
void getSentinelHash();

// ---------------------------------------------------------------------------
// Use-case function
// ---------------------------------------------------------------------------

const INVALID_CREDENTIALS = 'Invalid credentials';

export async function loginUser(
    rawInput: unknown,
    repo: UserRepository,
): Promise<LoginResult> {
    // 1. Validate shape
    const parsed = loginSchema.safeParse(rawInput);
    if (!parsed.success) {
        // Return the same generic message — don't reveal which field is wrong.
        return { ok: false, reason: INVALID_CREDENTIALS };
    }

    const { email, password } = parsed.data;

    // 2. Look up user
    const user = await repo.findByEmail(email);

    // 3. Always verify to maintain constant-time behaviour
    const hashToVerify = user?.password_hash ?? (await getSentinelHash());
    const isValid = await verify(hashToVerify, password);

    if (!user || !isValid) {
        return { ok: false, reason: INVALID_CREDENTIALS };
    }

    return { ok: true, user: { id: user.id, email: user.email } };
}
