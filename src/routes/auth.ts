/**
 * Auth router — thin Express 5 adapter layer over the application use-cases.
 *
 * Routes:
 *   POST   /auth/register  – create a new account, auto-logs-in on success
 *   POST   /auth/login     – authenticate, set session cookie
 *   POST   /auth/logout    – destroy session cookie
 *   GET    /auth/me        – return the currently authenticated user (or 401)
 *
 * This file intentionally contains NO business logic — all domain work lives
 * in src/modules/auth/application/*.ts. The router only:
 *   1. Reads request data
 *   2. Calls the use-case
 *   3. Reads/writes the iron-session cookie
 *   4. Sends the HTTP response
 */

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { getIronSession } from 'iron-session';
import type { IronSession } from 'iron-session';
import { sessionOptions } from '../shared/session';
import type { SessionUser } from '../shared/session';
import { registerUser } from '../modules/auth/application/registerUser';
import type { RegisterFailure } from '../modules/auth/application/registerUser';
import { loginUser } from '../modules/auth/application/loginUser';
import { getUserRepository } from './authRepositoryFactory';

const router = Router();

// ---------------------------------------------------------------------------
// Helper: typed session accessor
// ---------------------------------------------------------------------------

function getSession(req: Request, res: Response): Promise<IronSession<{ user?: SessionUser }>> {
    return getIronSession<{ user?: SessionUser }>(req, res, sessionOptions);
}

// ---------------------------------------------------------------------------
// Helper: resolve the correct UserRepository for the running DB backend
// ---------------------------------------------------------------------------

// Lazily resolved so the persistence layer has time to initialise first.
function getRepo() {
    return getUserRepository();
}

// ---------------------------------------------------------------------------
// Middleware: require an authenticated session
// ---------------------------------------------------------------------------

export async function requireAuth(
    req: Request,
    res: Response,
    next: NextFunction,
): Promise<void> {
    const session = await getSession(req, res);
    if (!session.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
    }
    // Attach to request so downstream handlers can access it without re-reading.
    res.locals['authUser'] = session.user;
    next();
}

// ---------------------------------------------------------------------------
// POST /auth/register
// ---------------------------------------------------------------------------

router.post('/register', async (req: Request, res: Response) => {
    const result = await registerUser(req.body, getRepo());

    if (!result.ok) {
        const failure = result as RegisterFailure;
        res.status(400).json({
            error: failure.reason,
            ...(failure.fieldErrors ? { fields: failure.fieldErrors } : {}),
        });
        return;
    }

    // Auto-login after successful registration.
    const session = await getSession(req, res);
    session.user = result.user;
    await session.save();

    res.status(201).json({ user: result.user });
});

// ---------------------------------------------------------------------------
// POST /auth/login
// ---------------------------------------------------------------------------

router.post('/login', async (req: Request, res: Response) => {
    const result = await loginUser(req.body, getRepo());

    if (!result.ok) {
        res.status(401).json({ error: result.reason });
        return;
    }

    const session = await getSession(req, res);
    session.user = result.user;
    await session.save();

    res.json({ user: result.user });
});

// ---------------------------------------------------------------------------
// POST /auth/logout
// ---------------------------------------------------------------------------

router.post('/logout', async (req: Request, res: Response) => {
    const session = await getSession(req, res);
    session.destroy();
    await session.save();
    res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// GET /auth/me
// ---------------------------------------------------------------------------

router.get('/me', requireAuth, (_req: Request, res: Response) => {
    res.json({ user: res.locals['authUser'] });
});

export default router;
