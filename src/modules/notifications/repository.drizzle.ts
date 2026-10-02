import { and, count, desc, eq, isNull } from 'drizzle-orm';
import { getDb } from '../../infrastructure/db/drizzle';
import { notifications } from '../../infrastructure/db/schema';
import type { Notification, NotificationRepository } from './types';

function toNotification(row: typeof notifications.$inferSelect): Notification {
    return { id: row.id, type: row.type, body: row.body, createdAt: row.createdAt.toISOString(), read: row.readAt !== null };
}

const unread = (userId: string) => and(eq(notifications.recipientId, userId), isNull(notifications.readAt));

/**
 * Reads what the worker writes (src/workers/notifications). The API never
 * creates a notification: they only come from events.
 */
export const notificationRepository: NotificationRepository = {
    async listRecent(userId, limit) {
        const rows = await getDb().select().from(notifications)
            .where(eq(notifications.recipientId, userId)).orderBy(desc(notifications.createdAt)).limit(limit);
        return rows.map(toNotification);
    },
    async countUnread(userId) {
        const [{ total }] = await getDb().select({ total: count() }).from(notifications).where(unread(userId));
        return total;
    },
    async markAllRead(userId, readAt) {
        await getDb().update(notifications).set({ readAt }).where(unread(userId));
    },
};
