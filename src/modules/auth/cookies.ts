import type { CookieOptions } from 'express';

export const SESSION_COOKIE = 'sid';

/**
 * Reads one cookie from a Cookie header. Express 5 does not parse cookies
 * without the cookie-parser middleware, and one cookie does not justify a
 * dependency.
 */
export function readCookie(header: string | undefined, name: string): string | undefined {
    if (!header) return undefined;

    for (const pair of header.split(';')) {
        const separator = pair.indexOf('=');
        if (separator === -1) continue;
        if (pair.slice(0, separator).trim() !== name) continue;

        const value = pair.slice(separator + 1).trim();
        try {
            return decodeURIComponent(value);
        } catch {
            // Malformed percent-encoding: treat it as no cookie at all.
            return undefined;
        }
    }
    return undefined;
}

/**
 * httpOnly: page scripts never see the token, so an XSS cannot steal it.
 * sameSite lax: the browser does not send it with a cross-site POST, PUT or
 * DELETE, which is what protects the JSON API against CSRF.
 * secure: only sent over HTTPS. See `secureCookies` in src/index.ts for when
 * it is on.
 */
export function sessionCookieOptions(secure: boolean, maxAgeMs?: number): CookieOptions {
    return {
        httpOnly: true,
        sameSite: 'lax',
        secure,
        path: '/',
        ...(maxAgeMs === undefined ? {} : { maxAge: maxAgeMs }),
    };
}
