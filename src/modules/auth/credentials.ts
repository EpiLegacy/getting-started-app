import { z } from 'zod';

/**
 * Trimmed and lowercased before anything else sees it, so "Alice@x.io " and
 * "alice@x.io" are the same account everywhere. 254 is the longest address
 * SMTP can deliver to.
 */
const email = z.string().trim().toLowerCase().max(254).pipe(z.email());

/**
 * Length is the only rule, as NIST SP 800-63B recommends: no forced mix of
 * character classes, which mostly produces "Password1!". 12 is above NIST's
 * minimum of 8 on purpose. The upper bound only stops a megabyte-long
 * password from being hashed.
 */
export const registerSchema = z.object({
    email,
    password: z.string().min(12).max(128),
});

/**
 * No minimum length at login: the rules only apply when a password is chosen,
 * and a wrong password must get the same answer whatever its length.
 */
export const loginSchema = z.object({
    email,
    password: z.string().min(1).max(128),
});

export const deleteAccountSchema = z.object({
    password: z.string().min(1).max(128),
}).strict();

export type Credentials = z.infer<typeof registerSchema>;
