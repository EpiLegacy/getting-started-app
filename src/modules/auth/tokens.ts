import { createHash, randomBytes } from 'node:crypto';

/** 256 random bits, URL-safe so it fits in a cookie as is. */
export function newSessionToken(): string {
    return randomBytes(32).toString('base64url');
}

/**
 * What the sessions table stores instead of the token. A plain SHA-256 is
 * enough here, unlike for passwords: the token is 256 random bits, so there
 * is nothing to guess and nothing to slow down.
 */
export function hashSessionToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
}
