import express from 'express';
import request from 'supertest';
import { createNotificationRouter, RECENT_LIMIT } from '../../../src/modules/notifications/routes';
import type { AuthService } from '../../../src/modules/auth/service';
import type { NotificationRepository } from '../../../src/modules/notifications/types';
import { closeServers, listen } from '../../support/server';

const service: AuthService = {
    authenticate: async token => token === 'valid' ? { id: 'alice', email: 'alice@example.com' } : undefined,
    profile: jest.fn(), deleteAccount: jest.fn(), register: jest.fn(), login: jest.fn(), logout: jest.fn(),
};
const repository: jest.Mocked<NotificationRepository> = {
    listRecent: jest.fn(),
    countUnread: jest.fn(),
    markAllRead: jest.fn(),
};
const notification = { id: 'n1', type: 'task.completed', body: 'Task "Ship it" moved to Done', createdAt: '2026-10-02T08:00:00.000Z', read: false };

function app() {
    return listen(express().use('/notifications', createNotificationRouter(service, repository)));
}

beforeEach(() => jest.resetAllMocks());
afterEach(closeServers);

test('unavailable authentication fails closed', async () => {
    const server = await listen(express().use('/notifications', createNotificationRouter(undefined, repository)));
    expect((await request(server).get('/notifications')).status).toBe(503);
    expect(repository.listRecent).not.toHaveBeenCalled();
});

test('anonymous callers are rejected before repository access', async () => {
    const server = await app();
    for (const res of await Promise.all([request(server).get('/notifications'), request(server).post('/notifications/read')])) {
        expect(res.status).toBe(401);
    }
    expect(repository.listRecent).not.toHaveBeenCalled();
    expect(repository.markAllRead).not.toHaveBeenCalled();
});

test('lists the session user\'s recent notifications with the unread count', async () => {
    repository.listRecent.mockResolvedValue([notification]);
    repository.countUnread.mockResolvedValue(1);
    const res = await request(await app()).get('/notifications?userId=bob').set('Cookie', 'sid=valid');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ notifications: [notification], unread: 1 });
    expect(res.headers['cache-control']).toBe('no-store');
    expect(repository.listRecent).toHaveBeenCalledWith('alice', RECENT_LIMIT);
    expect(repository.countUnread).toHaveBeenCalledWith('alice');
});

test('marking as read only touches the session user\'s notifications', async () => {
    const res = await request(await app()).post('/notifications/read').set('Cookie', 'sid=valid');
    expect(res.status).toBe(204);
    expect(repository.markAllRead).toHaveBeenCalledWith('alice', expect.any(Date));
});
