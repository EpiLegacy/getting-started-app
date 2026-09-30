import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import { getDb, transaction, unwrapErrors } from '../../infrastructure/db/drizzle';
import {
    projectItems,
    projectMembers,
    projects,
    todoItems,
    users,
} from '../../infrastructure/db/schema';
import type { ProjectRepository } from './types';

const projectColumns = {
    id: projects.id,
    ownerId: projects.ownerId,
    name: projects.name,
    createdAt: projects.createdAt,
};

function errorCode(error: unknown): string | undefined {
    return (error as { code?: string }).code;
}

async function insertLink(
    insert: () => Promise<unknown>,
): Promise<'added' | 'duplicate' | 'missing'> {
    try {
        await insert();
        return 'added';
    } catch (error) {
        const code = errorCode(error);

        if (code === 'ER_DUP_ENTRY') {
            return 'duplicate';
        }

        if (code === 'ER_NO_REFERENCED_ROW_2') {
            return 'missing';
        }

        throw error;
    }
}

export const drizzleProjectRepository: ProjectRepository = {
    async createWithOwner(project) {
        await transaction(async tx => {
            await tx.insert(projects).values(project);

            await tx.insert(projectMembers).values({
                projectId: project.id,
                userId: project.ownerId,
            });
        });
    },

    async listForUser(userId) {
        return unwrapErrors(() =>
            getDb()
                .select(projectColumns)
                .from(projectMembers)
                .innerJoin(
                    projects,
                    eq(projects.id, projectMembers.projectId),
                )
                .where(eq(projectMembers.userId, userId))
                .orderBy(desc(projects.createdAt)),
        );
    },

    async findForMember(projectId, userId) {
        const rows = await unwrapErrors(() =>
            getDb()
                .select(projectColumns)
                .from(projectMembers)
                .innerJoin(
                    projects,
                    eq(projects.id, projectMembers.projectId),
                )
                .where(
                    and(
                        eq(projectMembers.projectId, projectId),
                        eq(projectMembers.userId, userId),
                    ),
                )
                .limit(1),
        );

        return rows[0];
    },

    async listMembers(projectId) {
        return unwrapErrors(() =>
            getDb()
                .select({
                    id: users.id,
                    email: users.email,
                })
                .from(projectMembers)
                .innerJoin(
                    users,
                    eq(users.id, projectMembers.userId),
                )
                .where(eq(projectMembers.projectId, projectId))
                .orderBy(asc(users.email)),
        );
    },

    async listItems(projectId) {
        return unwrapErrors(() =>
            getDb()
                .select({
                    taskKey: todoItems.taskKey,
                    id: todoItems.id,
                    userId: todoItems.userId,
                    name: todoItems.name,
                    completed: todoItems.completed,
                    deadline: todoItems.deadline,
                    priorisation: todoItems.priorisation,
                })
                .from(projectItems)
                .innerJoin(
                    todoItems,
                    eq(todoItems.taskKey, projectItems.taskKey),
                )
                .where(eq(projectItems.projectId, projectId))
                .orderBy(asc(todoItems.taskKey)),
        );
    },

    async rename(projectId, name) {
        await unwrapErrors(() =>
            getDb()
                .update(projects)
                .set({ name })
                .where(eq(projects.id, projectId)),
        );
    },

    async delete(projectId) {
        await unwrapErrors(() =>
            getDb()
                .delete(projects)
                .where(eq(projects.id, projectId)),
        );
    },

    async findUserIdByEmail(email) {
        const rows = await unwrapErrors(() =>
            getDb()
                .select({ id: users.id })
                .from(users)
                .where(eq(users.email, email))
                .limit(1),
        );

        return rows[0]?.id;
    },

    async addMember(projectId, userId) {
        const result = await insertLink(() =>
            unwrapErrors(() =>
                getDb()
                    .insert(projectMembers)
                    .values({
                        projectId,
                        userId,
                    }),
            ),
        );

        return result === 'duplicate'
            ? 'already_member'
            : result;
    },

    async removeMember(projectId, userId) {
        await unwrapErrors(() =>
            getDb()
                .delete(projectMembers)
                .where(
                    and(
                        eq(projectMembers.projectId, projectId),
                        eq(projectMembers.userId, userId),
                    ),
                ),
        );
    },

    async isItemOwnedBy(taskKey, userId) {
        const rows = await unwrapErrors(() =>
            getDb()
                .select({
                    taskKey: todoItems.taskKey,
                })
                .from(todoItems)
                .where(
                    and(
                        eq(todoItems.taskKey, taskKey),
                        eq(todoItems.userId, userId),
                    ),
                )
                .limit(1),
        );

        return rows.length > 0;
    },

    async addItem(projectId, taskKey, assigneeId) {
        await transaction(async tx => {
            await tx
                .insert(projectItems)
                .values({
                    projectId,
                    taskKey,
                });
    
            await tx
                .update(todoItems)
                .set({
                    userId: assigneeId,
                })
                .where(
                    eq(todoItems.taskKey, taskKey),
                );
        });
    
        return 'added';
    },

    async removeItem(projectId, taskKey) {
        await transaction(async tx => {
            await tx
                .delete(projectItems)
                .where(
                    and(
                        eq(projectItems.projectId, projectId),
                        eq(projectItems.taskKey, taskKey),
                    ),
                );

            const [stillLinked] = await tx
                .select({
                    taskKey: projectItems.taskKey,
                })
                .from(projectItems)
                .where(eq(projectItems.taskKey, taskKey))
                .limit(1);

            if (!stillLinked) {
                await tx
                    .delete(todoItems)
                    .where(
                        and(
                            eq(todoItems.taskKey, taskKey),
                            isNull(todoItems.userId),
                        ),
                    );
            }
        });
    },
};
