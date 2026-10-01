import express from 'express';
import request from 'supertest';
import type { AuthService } from '../../../src/modules/auth/service';
import { createProjectsRouter } from '../../../src/modules/projects/routes';
import type { ProjectService } from '../../../src/modules/projects/service';

const auth: AuthService = {
    authenticate: async token => token === 'valid' ? { id: 'alice', email: 'alice@example.com' } : undefined,
    profile: jest.fn(), deleteAccount: jest.fn(), register: jest.fn(), login: jest.fn(), logout: jest.fn(),
};
const service = {
    list: jest.fn(), create: jest.fn(), get: jest.fn(), rename: jest.fn(), remove: jest.fn(),
    addMember: jest.fn(), removeMember: jest.fn(), addItem: jest.fn(), removeItem: jest.fn(),
} as unknown as jest.Mocked<ProjectService>;

const PROJECT = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const BOB = '0f8fad5b-d9cb-469f-a165-70867728950e';
const project = { id: PROJECT, ownerId: 'alice', name: 'Launch', createdAt: '2026-10-02T08:00:00.000Z' };

function app(authService: AuthService | null = auth) {
    const server = express().use(express.json()).use('/projects', createProjectsRouter(service, authService ?? undefined));
    // Same shape as the application's error handler: an unexpected error is a 500.
    server.use((_error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
        res.status(500).json({ error: 'internal_error' });
    });
    return server;
}
const as = (req: request.Test) => req.set('Cookie', 'sid=valid');

beforeEach(() => jest.resetAllMocks());

test('unavailable authentication fails closed', async () => {
    const res = await request(app(null)).get('/projects');
    expect(res.status).toBe(503);
    expect(service.list).not.toHaveBeenCalled();
});

test('every route rejects anonymous callers before reaching the service', async () => {
    const server = app();
    for (const res of await Promise.all([
        request(server).get('/projects'),
        request(server).post('/projects').send({ name: 'x' }),
        request(server).get(`/projects/${PROJECT}`),
        request(server).patch(`/projects/${PROJECT}`).send({ name: 'x' }),
        request(server).delete(`/projects/${PROJECT}`),
        request(server).post(`/projects/${PROJECT}/members`).send({ email: 'bob@example.com' }),
        request(server).delete(`/projects/${PROJECT}/members/${BOB}`),
        request(server).post(`/projects/${PROJECT}/items`).send({ taskKey: 1, userId: BOB }),
        request(server).delete(`/projects/${PROJECT}/items/1`),
    ])) {
        expect(res.status).toBe(401);
    }
    for (const fn of Object.values(service)) expect(fn).not.toHaveBeenCalled();
});

test('lists and creates projects for the session user only', async () => {
    service.list.mockResolvedValue([{ ...project, members: [] }]);
    service.create.mockResolvedValue(project);

    const listed = await as(request(app()).get('/projects?userId=bob'));
    expect(listed.status).toBe(200);
    expect(listed.body).toEqual({ projects: [{ ...project, members: [] }] });
    expect(service.list).toHaveBeenCalledWith('alice');

    const created = await as(request(app()).post('/projects').send({ name: '  Launch  ', ownerId: 'bob' }));
    expect(created.status).toBe(201);
    expect(created.body).toEqual({ project });
    expect(service.create).toHaveBeenCalledWith('alice', 'Launch');
});

test('rejects invalid input with 400 before reaching the service', async () => {
    const server = app();
    const long = 'x'.repeat(256);
    for (const res of await Promise.all([
        as(request(server).post('/projects').send({ name: '   ' })),
        as(request(server).post('/projects').send({ name: long })),
        as(request(server).get('/projects/not-a-uuid')),
        as(request(server).patch(`/projects/${PROJECT}`).send({})),
        as(request(server).patch('/projects/not-a-uuid').send({ name: 'x' })),
        as(request(server).delete('/projects/not-a-uuid')),
        as(request(server).post(`/projects/${PROJECT}/members`).send({ email: 'not-an-email' })),
        as(request(server).delete(`/projects/${PROJECT}/members/not-a-uuid`)),
        as(request(server).post(`/projects/${PROJECT}/items`).send({ taskKey: -1, userId: BOB })),
        as(request(server).post(`/projects/${PROJECT}/items`).send({ taskKey: 1, userId: 'bob' })),
        as(request(server).delete(`/projects/${PROJECT}/items/abc`)),
    ])) {
        expect(res.status).toBe(400);
    }
    for (const fn of Object.values(service)) expect(fn).not.toHaveBeenCalled();
});

test('reads, renames and deletes through the service with the session user', async () => {
    service.get.mockResolvedValue({ ok: true, value: { ...project, members: [], items: [] } });
    service.rename.mockResolvedValue({ ok: true, value: { ...project, name: 'Release' } });
    service.remove.mockResolvedValue({ ok: true, value: true });

    const read = await as(request(app()).get(`/projects/${PROJECT}`));
    expect(read.status).toBe(200);
    expect(read.body.project).toMatchObject({ id: PROJECT, items: [] });
    expect(service.get).toHaveBeenCalledWith(PROJECT, 'alice');

    const renamed = await as(request(app()).patch(`/projects/${PROJECT}`).send({ name: 'Release' }));
    expect(renamed.status).toBe(200);
    expect(renamed.body.project.name).toBe('Release');
    expect(service.rename).toHaveBeenCalledWith(PROJECT, 'alice', 'Release');

    expect((await as(request(app()).delete(`/projects/${PROJECT}`))).status).toBe(204);
    expect(service.remove).toHaveBeenCalledWith(PROJECT, 'alice');
});

test('manages members and items through the service with the session user', async () => {
    service.addMember.mockResolvedValue({ ok: true, value: [{ id: BOB, email: 'bob@example.com' }] });
    service.removeMember.mockResolvedValue({ ok: true, value: true });
    service.addItem.mockResolvedValue({ ok: true, value: [] });
    service.removeItem.mockResolvedValue({ ok: true, value: true });

    const invited = await as(request(app()).post(`/projects/${PROJECT}/members`).send({ email: ' bob@example.com ' }));
    expect(invited.status).toBe(201);
    expect(invited.body).toEqual({ members: [{ id: BOB, email: 'bob@example.com' }] });
    expect(service.addMember).toHaveBeenCalledWith(PROJECT, 'alice', 'bob@example.com');

    expect((await as(request(app()).delete(`/projects/${PROJECT}/members/${BOB}`))).status).toBe(204);
    expect(service.removeMember).toHaveBeenCalledWith(PROJECT, 'alice', BOB);

    const attached = await as(request(app()).post(`/projects/${PROJECT}/items`).send({ taskKey: 4, userId: BOB }));
    expect(attached.status).toBe(201);
    expect(attached.body).toEqual({ items: [] });
    expect(service.addItem).toHaveBeenCalledWith(PROJECT, 'alice', 4, BOB);

    expect((await as(request(app()).delete(`/projects/${PROJECT}/items/4`))).status).toBe(204);
    expect(service.removeItem).toHaveBeenCalledWith(PROJECT, 'alice', 4);
});

test.each([
    ['not_found', 404], ['user_not_found', 404], ['item_not_found', 404], ['forbidden', 403],
    ['already_member', 409], ['already_in_project', 409], ['owner_cannot_leave', 409], ['assignee_not_member', 409],
    ['unexpected', 500],
] as const)('maps the service error %s to HTTP %i on every route', async (error, status) => {
    const failure = { ok: false, error } as never;
    for (const fn of [service.get, service.rename, service.remove, service.addMember, service.removeMember, service.addItem, service.removeItem]) {
        fn.mockResolvedValue(failure);
    }
    const server = app();
    for (const res of await Promise.all([
        as(request(server).get(`/projects/${PROJECT}`)),
        as(request(server).patch(`/projects/${PROJECT}`).send({ name: 'x' })),
        as(request(server).delete(`/projects/${PROJECT}`)),
        as(request(server).post(`/projects/${PROJECT}/members`).send({ email: 'bob@example.com' })),
        as(request(server).delete(`/projects/${PROJECT}/members/${BOB}`)),
        as(request(server).post(`/projects/${PROJECT}/items`).send({ taskKey: 1, userId: BOB })),
        as(request(server).delete(`/projects/${PROJECT}/items/1`)),
    ])) {
        expect(res.status).toBe(status);
        expect(res.body.error).toBe(status === 500 ? 'internal_error' : error);
    }
});

test('passes unexpected failures to the error handler instead of crashing', async () => {
    const boom = new Error('database down');
    for (const fn of Object.values(service)) fn.mockRejectedValue(boom);
    const server = app();
    for (const res of await Promise.all([
        as(request(server).get('/projects')),
        as(request(server).post('/projects').send({ name: 'x' })),
        as(request(server).get(`/projects/${PROJECT}`)),
        as(request(server).patch(`/projects/${PROJECT}`).send({ name: 'x' })),
        as(request(server).delete(`/projects/${PROJECT}`)),
        as(request(server).post(`/projects/${PROJECT}/members`).send({ email: 'bob@example.com' })),
        as(request(server).delete(`/projects/${PROJECT}/members/${BOB}`)),
        as(request(server).post(`/projects/${PROJECT}/items`).send({ taskKey: 1, userId: BOB })),
        as(request(server).delete(`/projects/${PROJECT}/items/1`)),
    ])) {
        expect(res.status).toBe(500);
    }
});
