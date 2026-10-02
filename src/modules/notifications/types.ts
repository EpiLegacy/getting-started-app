/** What the notification worker stored for one user, as the API returns it. */
export interface Notification {
    id: string;
    type: string;
    body: string;
    createdAt: string;
    read: boolean;
}

export interface NotificationFeed {
    notifications: Notification[];
    unread: number;
}

export interface NotificationRepository {
    /** The user's most recent notifications, newest first. */
    listRecent(userId: string, limit: number): Promise<Notification[]>;
    countUnread(userId: string): Promise<number>;
    markAllRead(userId: string, readAt: Date): Promise<void>;
}
