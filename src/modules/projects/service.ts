import { randomUUID } from 'node:crypto';
import type {
    ProjectDetailDto,
    ProjectDto,
    ProjectItemDto,
    ProjectListDto,
    ProjectMemberDto,
    ProjectRepository,
    StoredProject,
} from './types';

export type ProjectError =
    | 'not_found'
    | 'forbidden'
    | 'user_not_found'
    | 'item_not_found'
    | 'already_member'
    | 'already_in_project'
    | 'owner_cannot_leave'
    | 'assignee_not_member';

export type Result<T> =
    | { ok: true; value: T }
    | { ok: false; error: ProjectError };

const ok = <T>(value: T): Result<T> => ({
    ok: true,
    value,
});

const fail = <T = never>(error: ProjectError): Result<T> => ({
    ok: false,
    error,
});

const toDto = (project: StoredProject): ProjectDto => ({
    id: project.id,
    ownerId: project.ownerId,
    name: project.name,
    createdAt: project.createdAt.toISOString(),
});

export interface ProjectServiceOptions {
    now?: () => Date;
    newId?: () => string;
}

export function createProjectService(
    repository: ProjectRepository,
    options: ProjectServiceOptions = {},
) {
    const now = options.now ?? (() => new Date());
    const newId = options.newId ?? randomUUID;

    async function asMember(
        projectId: string,
        userId: string,
    ): Promise<StoredProject | undefined> {
        return repository.findForMember(projectId, userId);
    }

    async function isProjectMember(
        projectId: string,
        userId: string,
    ): Promise<boolean> {
        const members = await repository.listMembers(projectId);

        return members.some(member => member.id === userId);
    }

    return {
        async list(userId: string): Promise<ProjectListDto[]> {
            const projects = await repository.listForUser(userId);

            return Promise.all(
                projects.map(async project => ({
                    ...toDto(project),
                    members: await repository.listMembers(project.id),
                })),
            );
        },

        async create(
            userId: string,
            name: string,
        ): Promise<ProjectDto> {
            const project: StoredProject = {
                id: newId(),
                ownerId: userId,
                name,
                createdAt: now(),
            };

            await repository.createWithOwner(project);

            return toDto(project);
        },

        async get(
            projectId: string,
            userId: string,
        ): Promise<Result<ProjectDetailDto>> {
            const project = await asMember(projectId, userId);

            if (!project) {
                return fail('not_found');
            }

            const [members, items] = await Promise.all([
                repository.listMembers(projectId),
                repository.listItems(projectId),
            ]);

            return ok({
                ...toDto(project),
                members,
                items,
            });
        },

        async rename(
            projectId: string,
            userId: string,
            name: string,
        ): Promise<Result<ProjectDto>> {
            const project = await asMember(projectId, userId);

            if (!project) {
                return fail('not_found');
            }

            if (project.ownerId !== userId) {
                return fail('forbidden');
            }

            await repository.rename(projectId, name);

            return ok(
                toDto({
                    ...project,
                    name,
                }),
            );
        },

        async remove(
            projectId: string,
            userId: string,
        ): Promise<Result<true>> {
            const project = await asMember(projectId, userId);

            if (!project) {
                return fail('not_found');
            }

            if (project.ownerId !== userId) {
                return fail('forbidden');
            }

            await repository.delete(projectId);

            return ok(true);
        },

        async addMember(
            projectId: string,
            actorId: string,
            email: string,
        ): Promise<Result<ProjectMemberDto[]>> {
            const project = await asMember(projectId, actorId);

            if (!project) {
                return fail('not_found');
            }

            if (project.ownerId !== actorId) {
                return fail('forbidden');
            }

            const targetId =
                await repository.findUserIdByEmail(email);

            if (!targetId) {
                return fail('user_not_found');
            }

            const added =
                await repository.addMember(
                    projectId,
                    targetId,
                );

            if (added === 'already_member') {
                return fail('already_member');
            }

            if (added === 'missing') {
                return fail('user_not_found');
            }

            return ok(
                await repository.listMembers(projectId),
            );
        },

        async removeMember(
            projectId: string,
            actorId: string,
            targetId: string,
        ): Promise<Result<true>> {
            const project = await asMember(
                projectId,
                actorId,
            );

            if (!project) {
                return fail('not_found');
            }

            if (targetId === project.ownerId) {
                return fail('owner_cannot_leave');
            }

            if (
                actorId !== project.ownerId &&
                actorId !== targetId
            ) {
                return fail('forbidden');
            }

            await repository.removeMember(
                projectId,
                targetId,
            );

            return ok(true);
        },

        async addItem(
            projectId: string,
            actorId: string,
            taskKey: number,
            assigneeId: string,
        ): Promise<Result<ProjectItemDto[]>> {
            const project = await asMember(
                projectId,
                actorId,
            );

            if (!project) {
                return fail('not_found');
            }

            if (!(await repository.isItemOwnedBy(taskKey, actorId))) {
                return fail('item_not_found');
            }

            const isAssigneeMember = (
                await repository.listMembers(projectId)
            ).some(member => member.id === assigneeId);

            if (!isAssigneeMember) {
                return fail('assignee_not_member');
            }

            const added = await repository.addItem(
                projectId,
                taskKey,
                assigneeId,
            );

            if (added === 'already_in_project') {
                return fail('already_in_project');
            }

            if (added === 'missing') {
                return fail('item_not_found');
            }

            return ok(
                await repository.listItems(projectId),
            );
        },

        async removeItem(
            projectId: string,
            actorId: string,
            taskKey: number,
        ): Promise<Result<true>> {
            const project = await asMember(
                projectId,
                actorId,
            );

            if (!project) {
                return fail('not_found');
            }

            await repository.removeItem(
                projectId,
                taskKey,
            );

            return ok(true);
        },
    };
}

export type ProjectService = ReturnType<typeof createProjectService>;
