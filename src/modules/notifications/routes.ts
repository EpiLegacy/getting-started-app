import { Router } from 'express';
import { currentUser, requireAuth } from '../auth/routes';
import type { AuthService } from '../auth/service';
import type { NotificationFeed, NotificationRepository } from './types';

/** What the bell shows. Older notifications stay stored. */
export const RECENT_LIMIT = 20;

export function createNotificationRouter(service: AuthService | undefined, repository: NotificationRepository): Router {
    const router = Router();
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
    router.use(requireAuth(service));
    router.get('/', async (_req, res) => {
        const userId = currentUser(res).id;
        const [notifications, unread] = await Promise.all([
            repository.listRecent(userId, RECENT_LIMIT),
            repository.countUnread(userId),
        ]);
        const feed: NotificationFeed = { notifications, unread };
        res.json(feed);
    });
    router.post('/read', async (_req, res) => {
        await repository.markAllRead(currentUser(res).id, new Date());
        res.status(204).end();
    });
    return router;
}
