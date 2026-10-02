import express from 'express';
import request from 'supertest';
import { createTaskRouter } from '../../../src/modules/tasks/routes';
import type { AuthService } from '../../../src/modules/auth/service';
import type { TaskRepository } from '../../../src/modules/tasks/types';
import { closeServers, listen } from '../../support/server';

const service: AuthService = {
    authenticate: async token => token === 'valid' ? { id: 'alice', email: 'alice@example.com' } : undefined,
    profile: jest.fn(), deleteAccount: jest.fn(), register: jest.fn(), login: jest.fn(), logout: jest.fn(),
};
const repository: jest.Mocked<TaskRepository> = {
    list: jest.fn(),
    listUnassigned: jest.fn(),
    create: jest.fn(),
    claim: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    listForUser: jest.fn(),
};
const input = { name: 'Task', completed: false, deadline: '', priorisation: 'medium', status: 'todo' as const };
function app(auth: AuthService | undefined = service) {
    return listen(express().use(express.json()).use('/items', createTaskRouter(auth, repository)));
}

beforeEach(() => jest.resetAllMocks());
afterEach(closeServers);

test('unavailable authentication fails closed', async () => {
    const server = await listen(express().use('/items', createTaskRouter(undefined, repository)));
    expect((await request(server).get('/items')).status).toBe(503);
    expect(repository.list).not.toHaveBeenCalled();
});

test('all task operations reject anonymous callers before repository access', async () => {
    const server = await app();
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
    expect((await request(await app()).get('/items?userId=bob').set('Cookie', 'sid=valid')).status).toBe(200);
    expect(repository.list).toHaveBeenCalledWith('alice');
    expect((await request(await app()).get('/items/unassigned').set('Cookie', 'sid=valid')).status).toBe(200);
    expect(repository.listUnassigned).toHaveBeenCalledWith('alice');
});

test('new task ownership comes from the session and unknown fields are stripped', async () => {
    const res = await request(await app()).post('/items').set('Cookie', 'sid=valid')
        .send({ ...input, userId: 'bob', id: 99, completed: true });
    expect(res.status).toBe(201);
    expect(repository.create).toHaveBeenCalledWith('alice', input);
});

const assignment = { projectId: '11111111-1111-4111-8111-111111111111', userId: '22222222-2222-4222-8222-222222222222' };

test('claim requires a project and an assignee, and passes the authenticated actor', async () => {
    repository.claim.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const server = await app();
    for (const body of [{}, { userId: assignment.userId }, { projectId: assignment.projectId }, { ...assignment, userId: 'bad' }]) {
        expect((await request(server).post('/items/12/claim').set('Cookie', 'sid=valid').send(body)).status).toBe(400);
    }
    expect(repository.claim).not.toHaveBeenCalled();
    expect((await request(server).post('/items/12/claim').set('Cookie', 'sid=valid').send(assignment)).status).toBe(204);
    expect(repository.claim).toHaveBeenCalledWith(12, 'alice', assignment.projectId, assignment.userId);
    const conflict = await request(server).post('/items/12/claim').set('Cookie', 'sid=valid').send(assignment);
    expect(conflict.status).toBe(409);
    expect(conflict.body).toEqual({ error: 'task_unavailable' });
});

test('update and delete pass ownership to the repository and hide inaccessible tasks', async () => {
    repository.update.mockResolvedValueOnce({ ...input, priorisation: 'medium', id: '12', userId: 'alice' }).mockResolvedValueOnce(undefined);
    repository.remove.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    for (const expected of [200, 404]) {
        const res = await request(await app()).put('/items/12').set('Cookie', 'sid=valid').set('x-correlation-id', 'test').send({ ...input, userId: 'bob' });
        expect(res.status).toBe(expected);
    }
    expect(repository.update).toHaveBeenCalledWith(12, 'alice', input, 'test');
    for (const expected of [204, 404]) expect((await request(await app()).delete('/items/12').set('Cookie', 'sid=valid')).status).toBe(expected);
    expect(repository.remove).toHaveBeenCalledWith(12, 'alice');
});

test('rejects malformed ids and task bodies', async () => {
    for (const id of ['0', '-1', '1e2', '4294967296', 'bad']) {
        expect((await request(await app()).post(`/items/${id}/claim`).set('Cookie', 'sid=valid')).status).toBe(404);
    }
    expect((await request(await app()).post('/items').set('Cookie', 'sid=valid').send({ ...input, name: '' })).status).toBe(400);
    expect((await request(await app()).put('/items/12').set('Cookie', 'sid=valid').send({ ...input, priorisation: 'bad' })).status).toBe(400);
    expect(repository.claim).not.toHaveBeenCalled();
});

test('rejects a completed flag that contradicts the status, and lets a card move with its status alone', async () => {
    const contradictions = [
        request(await app()).put('/items/12').set('Cookie', 'sid=valid').send({ ...input, completed: true }),
        request(await app()).patch('/items/12').set('Cookie', 'sid=valid').send({ completed: false, status: 'completed' }),
    ];
    for (const res of await Promise.all(contradictions)) {
        expect(res.status).toBe(400);
        expect(res.body.error).toBe('invalid_task');
    }
    expect(repository.update).not.toHaveBeenCalled();

    repository.update.mockResolvedValueOnce({ ...input, priorisation: 'medium', completed: true, status: 'completed', id: '12', userId: 'alice' });
    const moved = await request(await app()).patch('/items/12').set('Cookie', 'sid=valid').set('x-correlation-id', 'test').send({ status: 'completed' });
    expect(moved.status).toBe(200);
    expect(repository.update).toHaveBeenCalledWith(12, 'alice', { status: 'completed' }, 'test');
});
