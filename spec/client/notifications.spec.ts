import { notificationsApi } from '../../src/client/features/notifications/api';
import { bellLabel, formatTime, newArrival } from '../../src/client/features/notifications/feed';
import type { Notification } from '../../src/modules/notifications/types';

const unread: Notification = { id: 'n2', type: 'task.completed', body: 'Task "Ship it" moved to Done', createdAt: '2026-10-02T12:00:00.000Z', read: false };
const older: Notification = { ...unread, id: 'n1', body: 'Task "Plan" moved to Done', read: true };

test('the bell is named after its unread count', () => {
    expect(bellLabel(0)).toBe('Notifications');
    expect(bellLabel(3)).toBe('Notifications, 3 unread');
});

describe('newArrival', () => {
    test('announces an unread notification that was not there at the previous poll', () => {
        expect(newArrival('n1', { notifications: [unread, older], unread: 1 })).toBe('New notification: Task "Ship it" moved to Done');
        expect(newArrival('', { notifications: [unread], unread: 1 })).toBe('New notification: Task "Ship it" moved to Done');
    });

    test('stays silent on the first load, without news, or for a notification already read', () => {
        expect(newArrival(undefined, { notifications: [unread], unread: 1 })).toBeUndefined();
        expect(newArrival('n2', { notifications: [unread], unread: 1 })).toBeUndefined();
        expect(newArrival('n0', { notifications: [older], unread: 0 })).toBeUndefined();
        expect(newArrival('', { notifications: [], unread: 0 })).toBeUndefined();
    });
});

test('times are short and readable', () => {
    // Noon UTC is still the 2nd in every time zone a runner may use.
    expect(formatTime(unread.createdAt)).toMatch(/^2 Oct(,| at) \d{2}:\d{2}$/);
});

describe('notificationsApi', () => {
    let fetchMock: jest.SpiedFunction<typeof fetch>;
    beforeEach(() => { fetchMock = jest.spyOn(globalThis, 'fetch'); });
    afterEach(() => fetchMock.mockRestore());

    test('lists the feed with the session cookie', async () => {
        fetchMock.mockResolvedValue(new Response(JSON.stringify({ notifications: [unread], unread: 1 }), { status: 200 }));
        await expect(notificationsApi.list()).resolves.toEqual({ notifications: [unread], unread: 1 });
        expect(fetchMock).toHaveBeenCalledWith('/notifications', expect.objectContaining({ credentials: 'same-origin' }));
    });

    test('marks everything read with a POST', async () => {
        fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
        await expect(notificationsApi.markAllRead()).resolves.toBeUndefined();
        expect(fetchMock).toHaveBeenCalledWith('/notifications/read', expect.objectContaining({ method: 'POST' }));
    });
});
