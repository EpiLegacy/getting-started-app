import express from 'express';
import request from 'supertest';
import { createTaskRouter } from '../../../src/modules/tasks/routes';
import type { AuthService } from '../../../src/modules/auth/service';
import type { TaskRepository } from '../../../src/modules/tasks/types';

const service: AuthService = {
    authenticate: async token => token === 'valid' ? { id: 'alice', email: 'alice@example.com' } : undefined,
    profile: jest.fn(), deleteAccount: jest.fn(), register: jest.fn(), login: jest.fn(), logout: jest.fn(),
};
const repository: jest.Mocked<TaskRepository> = {
    list: jest.fn(), listUnassigned: jest.fn(), create: jest.fn(),
    claim: jest.fn(), update: jest.fn(), remove: jest.fn(),
};
const input = { name: 'Task', completed: false, deadline: '', priorisation: 'medium' };
function app(auth: AuthService | undefined = service) {
    return express().use(express.json()).use('/items', createTaskRouter(auth, repository));
}

beforeEach(() => jest.resetAllMocks());

test('unavailable authentication fails closed', async () => {
    const server = express().use('/items', createTaskRouter(undefined, repository));
    expect((await request(server).get('/items')).status).toBe(503);
    expect(repository.list).not.toHaveBeenCalled();
});

test('all task operations reject anonymous callers before repository access', async () => {
    const server = app();
    for (const res of await Promise.all([
        request(server).get('/items'), request(server).get('/items/unassigned'),
        request(server).post('/items').send(input), request(server).put('/items/1').send(input),
        request(server).delete('/items/1'), request(server).post('/items/1/claim'),
    ])) {
        expect(res.status).toBe(401);
        expect(res.headers['cache-control']).toBe('no-store');
    }
    for (const fn of Object.values(repository)) expect(fn).not.toHaveBeenCalled();
});

test('lists only the session user and exposes unassigned tasks separately', async () => {
    repository.list.mockResolvedValue([]);
    repository.listUnassigned.mockResolvedValue([]);
    expect((await request(app()).get('/items?userId=bob').set('Cookie', 'sid=valid')).status).toBe(200);
    expect(repository.list).toHaveBeenCalledWith('alice');
    expect((await request(app()).get('/items/unassigned').set('Cookie', 'sid=valid')).status).toBe(200);
    expect(repository.listUnassigned).toHaveBeenCalledTimes(1);
});

test('new task ownership comes from the session and unknown fields are stripped', async () => {
    const res = await request(app()).post('/items').set('Cookie', 'sid=valid')
        .send({ ...input, userId: 'bob', id: 99, completed: true });
    expect(res.status).toBe(201);
    expect(repository.create).toHaveBeenCalledWith('alice', input);
});

test('claim uses the authenticated user and reports stale claims as conflicts', async () => {
    repository.claim.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    expect((await request(app()).post('/items/12/claim').set('Cookie', 'sid=valid').send({ userId: 'bob' })).status).toBe(204);
    expect(repository.claim).toHaveBeenCalledWith(12, 'alice');
    const conflict = await request(app()).post('/items/12/claim').set('Cookie', 'sid=valid');
    expect(conflict.status).toBe(409);
    expect(conflict.body).toEqual({ error: 'task_unavailable' });
});

test('update and delete pass ownership to the repository and hide inaccessible tasks', async () => {
    repository.update.mockResolvedValueOnce({ ...input, priorisation: 'medium', id: '12', userId: 'alice' }).mockResolvedValueOnce(undefined);
    repository.remove.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    for (const expected of [200, 404]) {
        const res = await request(app()).put('/items/12').set('Cookie', 'sid=valid').set('x-correlation-id', 'test').send({ ...input, userId: 'bob' });
        expect(res.status).toBe(expected);
    }
    expect(repository.update).toHaveBeenCalledWith(12, 'alice', input, 'test');
    for (const expected of [204, 404]) expect((await request(app()).delete('/items/12').set('Cookie', 'sid=valid')).status).toBe(expected);
    expect(repository.remove).toHaveBeenCalledWith(12, 'alice');
});

test('rejects malformed ids and task bodies', async () => {
    for (const id of ['0', '-1', '1e2', '4294967296', 'bad']) {
        expect((await request(app()).post(`/items/${id}/claim`).set('Cookie', 'sid=valid')).status).toBe(404);
    }
    expect((await request(app()).post('/items').set('Cookie', 'sid=valid').send({ ...input, name: '' })).status).toBe(400);
    expect((await request(app()).put('/items/12').set('Cookie', 'sid=valid').send({ ...input, priorisation: 'bad' })).status).toBe(400);
    expect(repository.claim).not.toHaveBeenCalled();
});
