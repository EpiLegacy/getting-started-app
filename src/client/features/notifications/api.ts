import type { NotificationFeed } from '../../../modules/notifications/types';
import { request } from '../../lib/http';

export const notificationsApi = {
  list: (signal?: AbortSignal) => request<NotificationFeed>('/notifications', { signal }),
  markAllRead: () => request<void>('/notifications/read', { method: 'POST' }),
};
