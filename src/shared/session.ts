/**
 * iron-session configuration shared across all route handlers.
 *
 * SESSION_SECRET must be at least 32 characters. Generate one with:
 *   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 *
 * The session payload is minimal: only the authenticated user's id and email
 * are stored so that the encrypted cookie stays small. Full user data should
 * always be fetched from the database on demand.
 */

import type { SessionOptions } from 'iron-session';

// Fail-fast guard: a missing secret would either crash inside iron-session
// with a cryptic message or silently use an empty string as the key, which
// is a critical security vulnerability. Crashing here surfaces the problem
// immediately with a clear error.
const secret = process.env.SESSION_SECRET;
if (!secret || secret.length < 32) {
    throw new Error(
        '[auth] SESSION_SECRET must be set and at least 32 characters long.\n' +
        'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
    );
}

export interface SessionUser {
    id: string;
    email: string;
}

/** Augment the iron-session data type globally. */
declare module 'iron-session' {
    interface IronSessionData {
        user?: SessionUser;
    }
}

/** Re-usable options object passed to `getIronSession` in every handler. */
export const sessionOptions: SessionOptions = {
    cookieName: 'app_session',
    password: secret,
    cookieOptions: {
        // Production-only: only send over HTTPS.
        secure: process.env.NODE_ENV === 'production',
        // Never accessible from JavaScript — mitigates XSS session theft.
        httpOnly: true,
        // Defends against CSRF: cookie is only sent on same-site requests.
        sameSite: 'lax',
        // 7-day sliding expiry (iron-session rotates the seal on each response).
        maxAge: 60 * 60 * 24 * 7,
    },
};
