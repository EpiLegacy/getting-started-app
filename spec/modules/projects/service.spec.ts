import { createProjectService } from '../../../src/modules/projects/service';
import type { ProjectItemDto, ProjectRepository, StoredProject } from '../../../src/modules/projects/types';

const NOW = new Date('2026-10-02T08:00:00.000Z');
const USERS: Record<string, string> = { alice: 'alice@example.com', bob: 'bob@example.com', carol: 'carol@example.com' };

/** In memory, with the same membership rules as the Drizzle repository. */
function fakeRepository() {
    const projects = new Map<string, StoredProject>();
    const members = new Map<string, Set<string>>();
    const items = new Map<string, Map<number, string>>();
    const ownedTasks = new Map<number, string>([[1, 'alice'], [2, 'alice'], [3, 'bob']]);
    const item = (taskKey: number, userId: string): ProjectItemDto => ({
        taskKey, id: `task-${taskKey}`, userId, name: `Task ${taskKey}`, completed: false, deadline: null, priorisation: null,
    });
    const repository: ProjectRepository = {
        createWithOwner: async project => {
            projects.set(project.id, project);
            members.set(project.id, new Set([project.ownerId]));
            items.set(project.id, new Map());
        },
        listForUser: async userId => [...projects.values()].filter(p => members.get(p.id)?.has(userId)),
        findForMember: async (projectId, userId) => members.get(projectId)?.has(userId) ? projects.get(projectId) : undefined,
        listMembers: async projectId => [...(members.get(projectId) ?? [])].map(id => ({ id, email: USERS[id] })),
        listItems: async projectId => [...(items.get(projectId) ?? [])].map(([key, user]) => item(key, user)),
        rename: async (projectId, name) => { projects.get(projectId)!.name = name; },
        delete: async projectId => { projects.delete(projectId); members.delete(projectId); items.delete(projectId); },
        findUserIdByEmail: async email => Object.keys(USERS).find(id => USERS[id] === email),
        addMember: async (projectId, userId) => {
            const set = members.get(projectId);
            if (!set) return 'missing';
            if (set.has(userId)) return 'already_member';
            set.add(userId);
            return 'added';
        },
        removeMember: async (projectId, userId) => { members.get(projectId)?.delete(userId); },
        isItemOwnedBy: async (taskKey, userId) => ownedTasks.get(taskKey) === userId,
        addItem: async (projectId, taskKey, assigneeId) => {
            const map = items.get(projectId);
            if (!map) return 'missing';
            if (map.has(taskKey)) return 'already_in_project';
            map.set(taskKey, assigneeId);
            return 'added';
        },
        removeItem: async (projectId, taskKey) => { items.get(projectId)?.delete(taskKey); },
    };
    return repository;
}

let ids = 0;
function setup() {
    const repository = fakeRepository();
    const service = createProjectService(repository, { now: () => NOW, newId: () => `project-${++ids}` });
    return { repository, service };
}

test('a new project belongs to its creator, who is its first member', async () => {
    const { service } = setup();
    const project = await service.create('alice', 'Launch');

    expect(project).toEqual({ id: expect.stringMatching(/^project-/), ownerId: 'alice', name: 'Launch', createdAt: NOW.toISOString() });
    expect(await service.list('alice')).toEqual([{ ...project, members: [{ id: 'alice', email: 'alice@example.com' }] }]);
    expect(await service.list('bob')).toEqual([]);
});

test('only members can read a project, and non-members cannot tell it exists', async () => {
    const { service } = setup();
    const { id } = await service.create('alice', 'Launch');

    const read = await service.get(id, 'alice');
    expect(read.ok && read.value).toMatchObject({ id, name: 'Launch', members: [{ id: 'alice' }], items: [] });
    expect(await service.get(id, 'bob')).toEqual({ ok: false, error: 'not_found' });
    expect(await service.get('missing', 'alice')).toEqual({ ok: false, error: 'not_found' });
});

test('only the owner renames or deletes a project', async () => {
    const { service } = setup();
    const { id } = await service.create('alice', 'Launch');
    await service.addMember(id, 'alice', 'bob@example.com');

    expect(await service.rename(id, 'bob', 'Hijacked')).toEqual({ ok: false, error: 'forbidden' });
    expect(await service.remove(id, 'bob')).toEqual({ ok: false, error: 'forbidden' });
    expect(await service.rename(id, 'carol', 'Hijacked')).toEqual({ ok: false, error: 'not_found' });
    expect(await service.remove(id, 'carol')).toEqual({ ok: false, error: 'not_found' });

    const renamed = await service.rename(id, 'alice', 'Release');
    expect(renamed.ok && renamed.value.name).toBe('Release');
    expect(await service.remove(id, 'alice')).toEqual({ ok: true, value: true });
    expect(await service.get(id, 'alice')).toEqual({ ok: false, error: 'not_found' });
});

test('only the owner invites, by e-mail, and only existing accounts', async () => {
    const { service } = setup();
    const { id } = await service.create('alice', 'Launch');

    const added = await service.addMember(id, 'alice', 'bob@example.com');
    expect(added.ok && added.value.map(m => m.id)).toEqual(['alice', 'bob']);
    expect(await service.addMember(id, 'alice', 'bob@example.com')).toEqual({ ok: false, error: 'already_member' });
    expect(await service.addMember(id, 'alice', 'nobody@example.com')).toEqual({ ok: false, error: 'user_not_found' });
    expect(await service.addMember(id, 'bob', 'carol@example.com')).toEqual({ ok: false, error: 'forbidden' });
    expect(await service.addMember(id, 'carol', 'carol@example.com')).toEqual({ ok: false, error: 'not_found' });
});

test('an add that loses a race with a deletion reports the user as missing', async () => {
    const { repository, service } = setup();
    const { id } = await service.create('alice', 'Launch');
    jest.spyOn(repository, 'addMember').mockResolvedValueOnce('missing');

    expect(await service.addMember(id, 'alice', 'bob@example.com')).toEqual({ ok: false, error: 'user_not_found' });
});

test('members can leave, the owner removes anyone but cannot leave', async () => {
    const { service } = setup();
    const { id } = await service.create('alice', 'Launch');
    await service.addMember(id, 'alice', 'bob@example.com');
    await service.addMember(id, 'alice', 'carol@example.com');

    expect(await service.removeMember(id, 'bob', 'carol')).toEqual({ ok: false, error: 'forbidden' });
    expect(await service.removeMember(id, 'alice', 'alice')).toEqual({ ok: false, error: 'owner_cannot_leave' });
    expect(await service.removeMember(id, 'bob', 'alice')).toEqual({ ok: false, error: 'owner_cannot_leave' });
    expect(await service.removeMember(id, 'bob', 'bob')).toEqual({ ok: true, value: true });
    expect(await service.removeMember(id, 'alice', 'carol')).toEqual({ ok: true, value: true });
    expect(await service.removeMember(id, 'carol', 'carol')).toEqual({ ok: false, error: 'not_found' });
    expect(await service.list('bob')).toEqual([]);
});

test('members attach only their own tasks, assigned to a member', async () => {
    const { service } = setup();
    const { id } = await service.create('alice', 'Launch');
    await service.addMember(id, 'alice', 'bob@example.com');

    const added = await service.addItem(id, 'alice', 1, 'bob');
    expect(added.ok && added.value).toEqual([expect.objectContaining({ taskKey: 1, userId: 'bob' })]);
    expect(await service.addItem(id, 'alice', 1, 'bob')).toEqual({ ok: false, error: 'already_in_project' });
    expect(await service.addItem(id, 'alice', 3, 'alice')).toEqual({ ok: false, error: 'item_not_found' });
    expect(await service.addItem(id, 'alice', 2, 'carol')).toEqual({ ok: false, error: 'assignee_not_member' });
    expect(await service.addItem(id, 'carol', 2, 'alice')).toEqual({ ok: false, error: 'not_found' });
});

test('a task deleted meanwhile is reported as missing', async () => {
    const { repository, service } = setup();
    const { id } = await service.create('alice', 'Launch');
    jest.spyOn(repository, 'addItem').mockResolvedValueOnce('missing');

    expect(await service.addItem(id, 'alice', 1, 'alice')).toEqual({ ok: false, error: 'item_not_found' });
});

test('members detach tasks from the project, outsiders cannot', async () => {
    const { service } = setup();
    const { id } = await service.create('alice', 'Launch');
    await service.addItem(id, 'alice', 1, 'alice');

    expect(await service.removeItem(id, 'bob', 1)).toEqual({ ok: false, error: 'not_found' });
    expect(await service.removeItem(id, 'alice', 1)).toEqual({ ok: true, value: true });
    const read = await service.get(id, 'alice');
    expect(read.ok && read.value.items).toEqual([]);
});

test('defaults to random ids and the current time', async () => {
    const service = createProjectService(fakeRepository());
    const project = await service.create('alice', 'Launch');
    expect(project.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(Date.parse(project.createdAt)).not.toBeNaN();
});
