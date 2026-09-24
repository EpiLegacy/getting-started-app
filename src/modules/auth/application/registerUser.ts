/**
 * registerUser — application use-case.
 *
 * Validates the incoming payload with Zod, checks for an existing account
 * (returning a generic error to avoid user-enumeration), hashes the password
 * with Argon2id (OWASP recommended defaults), and persists the new user.
 *
 * This function is pure domain logic: no Express types, no session handling.
 * The route handler is responsible for writing the session cookie.
 */

import { z } from 'zod';
import { hash } from '@node-rs/argon2';
import { v4 as uuid } from 'uuid';
import type { UserRepository, UserRecord } from '../infrastructure/userRepository';

// ---------------------------------------------------------------------------
// Input validation schema
// ---------------------------------------------------------------------------

/**
 * Password complexity rules:
 *  - Minimum 8 characters
 *  - At least one uppercase letter
 *  - At least one lowercase letter
 *  - At least one digit
 *  - At least one special character
 */
export const registerSchema = z.object({
    email: z.string().trim().toLowerCase().email('Must be a valid e-mail address'),
    password: z
        .string()
        .min(8, 'Password must be at least 8 characters')
        .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
        .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
        .regex(/[0-9]/, 'Password must contain at least one digit')
        .regex(
            /[^A-Za-z0-9]/,
            'Password must contain at least one special character',
        ),
});

export type RegisterInput = z.infer<typeof registerSchema>;

// ---------------------------------------------------------------------------
// Use-case output
// ---------------------------------------------------------------------------

export interface RegisterSuccess {
    ok: true;
    user: { id: string; email: string };
}

export interface RegisterFailure {
    ok: false;
    /** Human-readable reason safe to surface to the client. */
    reason: string;
    /** Zod field-level errors, only present on validation failure. */
    fieldErrors?: z.ZodFormattedError<RegisterInput>;
}

export type RegisterResult = RegisterSuccess | RegisterFailure;

// ---------------------------------------------------------------------------
// Use-case function
// ---------------------------------------------------------------------------

/**
 * Argon2id parameters (OWASP-minimum 2023):
 *  - memoryCost: 19456 KiB (19 MiB)
 *  - timeCost:   2 iterations
 *  - parallelism: 1
 */
const ARGON2_OPTIONS = {
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
} as const;

export async function registerUser(
    rawInput: unknown,
    repo: UserRepository,
): Promise<RegisterResult> {
    // 1. Parse + validate
    const parsed = registerSchema.safeParse(rawInput);
    if (!parsed.success) {
        return {
            ok: false,
            reason: 'Validation failed',
            fieldErrors: parsed.error.format(),
        };
    }

    const { email, password } = parsed.data;

    // 2. Check uniqueness
    const existing = await repo.findByEmail(email);
    if (existing) {
        // Generic message: do NOT reveal whether the e-mail is registered.
        return { ok: false, reason: 'Registration failed. Please try again.' };
    }

    // 3. Hash with Argon2id
    const password_hash = await hash(password, ARGON2_OPTIONS);

    // 4. Persist
    const user: UserRecord = {
        id: uuid(),
        email,
        password_hash,
        created_at: new Date().toISOString(),
    };

    await repo.insert(user);

    return { ok: true, user: { id: user.id, email: user.email } };
}
