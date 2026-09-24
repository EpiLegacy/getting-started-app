import { Router, type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import type { ZodType } from 'zod';
import { SESSION_COOKIE, readCookie, sessionCookieOptions } from './cookies';
import { deleteAccountSchema, loginSchema, registerSchema } from './credentials';
import { SESSION_TTL_MS, type AuthService, type SignedIn } from './service';
import { createAuthThrottle, type AuthThrottle } from './throttle';
import type { User } from './types';

export interface AuthRouterOptions {
    /** Adds the Secure attribute to the session cookie. */
    secureCookies: boolean;
    /** Attempt limits. A fresh in-memory set by default; tests pass their own clock. */
    throttle?: AuthThrottle;
}

/**
 * 429 with the delay in whole seconds. The password is not checked at all,
 * so the answer says nothing about whether it was right.
 */
function tooManyAttempts(res: Response, retryAfterMs: number): void {
    res.set('Retry-After', String(Math.ceil(retryAfterMs / 1000)));
    res.status(429).json({ error: 'too_many_attempts' });
}

function clientAddress(req: Request): string {
    return req.ip ?? 'unknown';
}

function parseBody<T>(schema: ZodType<T>, req: Request, res: Response): T | undefined {
    const parsed = schema.safeParse(req.body);
    if (parsed.success) return parsed.data;

    res.status(400).json({
        error: 'invalid_request',
        issues: parsed.error.issues.map(issue => ({ field: issue.path.join('.'), message: issue.message })),
    });
    return undefined;
}

/** Only for routes behind requireAuth(). */
export function currentUser(res: Response): User {
    return res.locals.user as User;
}

/**
 * Answers 401 unless the request carries a valid session cookie, and makes
 * the user available to the next handlers through currentUser(res).
 */
export function requireAuth(service: AuthService): RequestHandler {
    return async (req: Request, res: Response, next: NextFunction) => {
        const token = readCookie(req.headers.cookie, SESSION_COOKIE);
        const user = token ? await service.authenticate(token) : undefined;
        if (!user) {
            res.status(401).json({ error: 'unauthenticated' });
            return;
        }
        res.locals.user = user;
        next();
    };
}

/**
 * Registration, login/logout, session lookup, profile and self-service deletion.
 *
 * Without a service (MYSQL_HOST unset: the accounts live in MySQL only, see
 * ADR 0001) every route answers 503 rather than pretending to work.
 */
export function createAuthRouter(service: AuthService | undefined, options: AuthRouterOptions): Router {
    const router = Router();

    // Nothing an auth endpoint answers may be kept by a shared cache.
    router.use((_req, res, next) => {
        res.set('Cache-Control', 'no-store');
        next();
    });

    if (!service) {
        router.use((_req, res) => {
            res.status(503).json({ error: 'auth_unavailable', message: 'Authentication needs MySQL: set MYSQL_HOST.' });
        });
        return router;
    }

    // The session was created a moment ago with exactly this lifetime. Reading
    // the clock again here would make the cookie a millisecond shorter.
    const throttle = options.throttle ?? createAuthThrottle();

    const signIn = (res: Response, session: SignedIn, status: number) => {
        res.cookie(SESSION_COOKIE, session.token, sessionCookieOptions(options.secureCookies, SESSION_TTL_MS));
        res.status(status).json({ user: session.user });
    };

    router.post('/register', async (req, res) => {
        const credentials = parseBody(registerSchema, req, res);
        if (!credentials) return;

        const ip = clientAddress(req);
        const wait = throttle.registerPerIp.retryAfterMs(ip);
        if (wait > 0) return tooManyAttempts(res, wait);
        // Counted before hashing, so concurrent requests cannot all slip
        // through before the first one is recorded.
        throttle.registerPerIp.record(ip);

        const result = await service.register(credentials);
        if (result.kind === 'email_taken') {
            res.status(409).json({ error: 'email_taken' });
            return;
        }
        signIn(res, result, 201);
    });

    router.post('/login', async (req, res) => {
        const credentials = parseBody(loginSchema, req, res);
        if (!credentials) return;

        const ip = clientAddress(req);
        // The email is already normalised: "Alice@x.io" and "alice@x.io" share a count.
        const account = `${ip}|${credentials.email}`;
        const wait = Math.max(
            throttle.loginPerAccount.retryAfterMs(account),
            throttle.loginPerIp.retryAfterMs(ip),
        );
        if (wait > 0) return tooManyAttempts(res, wait);

        // Counted as a failure up front, so concurrent guesses cannot all get
        // through before the first result is known, then withdrawn on success.
        throttle.loginPerAccount.record(account);
        throttle.loginPerIp.record(ip);

        const result = await service.login(credentials);
        if (result.kind === 'signed_in') {
            throttle.loginPerAccount.reset(account);
            throttle.loginPerIp.release(ip);
        }
        if (result.kind === 'invalid_credentials') {
            // One answer for an unknown email and a wrong password.
            res.status(401).json({ error: 'invalid_credentials' });
            return;
        }
        signIn(res, result, 200);
    });

    router.post('/logout', async (req, res) => {
        const token = readCookie(req.headers.cookie, SESSION_COOKIE);
        if (token) await service.logout(token);
        res.clearCookie(SESSION_COOKIE, sessionCookieOptions(options.secureCookies));
        res.status(204).end();
    });

    router.get('/me', requireAuth(service), (_req, res) => {
        res.json({ user: currentUser(res) });
    });

    router.get('/profile', requireAuth(service), async (_req, res) => {
        const user = await service.profile(currentUser(res).id);
        if (!user) {
            res.status(401).json({ error: 'unauthenticated' });
            return;
        }
        res.json({ user });
    });

    router.delete('/me', requireAuth(service), async (req, res) => {
        const parsed = deleteAccountSchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ error: 'invalid_deletion_request' });
            return;
        }
        // Identity always comes from the session, never a supplied account id.
        const result = await service.deleteAccount(currentUser(res).id, parsed.data.password);
        if (result === 'invalid_password') {
            res.status(403).json({ error: 'invalid_password' });
            return;
        }
        res.clearCookie(SESSION_COOKIE, sessionCookieOptions(options.secureCookies));
        res.status(204).end();
    });

    return router;
}
