import type { NotificationFeed } from '../../../modules/notifications/types';

/** The bell's accessible name, which carries the unread count. */
export function bellLabel(unread: number): string {
  return unread > 0 ? `Notifications, ${unread} unread` : 'Notifications';
}

/**
 * What to announce after a poll, if anything. `newestSeen` is the id of the
 * newest notification already known, '' when there was none, and undefined
 * before the first load, so the history is not announced when a page opens.
 */
export function newArrival(newestSeen: string | undefined, feed: NotificationFeed): string | undefined {
  const newest = feed.notifications[0];
  if (newestSeen === undefined || !newest || newest.read || newest.id === newestSeen) return undefined;
  return `New notification: ${newest.body}`;
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}
