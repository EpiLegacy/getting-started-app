import { randomUUID } from 'node:crypto';
import { and, asc, eq, isNotNull, or, sql } from 'drizzle-orm';
import { getDb, transaction, unwrapErrors } from '../../infrastructure/db/drizzle';
import { projectItems, projectMembers, projects, todoItems } from '../../infrastructure/db/schema';
import { enqueue } from '../../infrastructure/outbox/outboxRepository.drizzle';
import { createEvent } from '../../shared/events/envelope';
import { TASK_COMPLETED, eventCatalog } from '../../shared/events/catalog';
import { syncCompletion } from './completion';
import type { Task, TaskRepository } from './types';

function toTask(row: typeof todoItems.$inferSelect): Task {
    return {
        id: String(row.taskKey),
        userId: row.userId,
        name: row.name ?? '',
        completed: row.completed === true,
        deadline: row.deadline ?? '',
        priorisation: row.priorisation ?? 'medium',
        status: row.status,
    };
}

/** Authenticated tasks always use MySQL, just like users and sessions. */
export const taskRepository: TaskRepository = {
    async list(userId) {
        const rows = await getDb().select().from(todoItems)
            .where(eq(todoItems.userId, userId)).orderBy(asc(todoItems.taskKey));
        return rows.map(toTask);
    },
    async listUnassigned(userId) {
        const rows = await getDb().select({ task: todoItems, projectId: projectItems.projectId })
            .from(todoItems).leftJoin(projectItems, eq(projectItems.taskKey, todoItems.taskKey))
            .where(sql`(
                (${projectItems.projectId} IS NULL AND (${todoItems.userId} IS NULL OR ${todoItems.userId} = ${userId}))
                OR (${todoItems.userId} IS NULL AND EXISTS (
                    SELECT 1 FROM ${projectMembers}
                    WHERE ${projectMembers.projectId} = ${projectItems.projectId}
                    AND ${projectMembers.userId} = ${userId}
                ))
            )`).orderBy(asc(todoItems.taskKey));
        return rows.map(row => ({ ...toTask(row.task), projectId: row.projectId }));
    },
    async create(userId, input) {
        const task = syncCompletion(input);
        const [{ taskKey }] = await getDb().insert(todoItems)
            .values({ ...task, id: randomUUID(), userId }).$returningId();
        return { ...task, id: String(taskKey), userId };
    },
    async claim(id, userId, projectId, assigneeId) {
        return transaction(async tx => {
            const [task] = await tx.select().from(todoItems)
                .where(eq(todoItems.taskKey, id)).for('update');
            if (!task) return false;
            const links = await tx.select().from(projectItems)
                .where(eq(projectItems.taskKey, id)).for('update');
            // Only incomplete assignments can be repaired. Existing project links stay intact.
            if (links.length && task.userId !== null) return false;
            if (!links.length && task.userId !== null && task.userId !== userId) return false;
            if (links.length && !links.some(link => link.projectId === projectId)) return false;
            // Lock memberships through the write so a concurrent removal cannot invalidate the choice.
            for (const targetProject of new Set([projectId, ...links.map(link => link.projectId)])) {
                const members = await tx.select().from(projectMembers)
                    .where(eq(projectMembers.projectId, targetProject)).for('update');
                if (!members.some(member => member.userId === assigneeId)) return false;
                if (targetProject === projectId && !members.some(member => member.userId === userId)) return false;
            }
            if (!links.length) await tx.insert(projectItems).values({ projectId, taskKey: id });
            await tx.update(todoItems).set({ userId: assigneeId }).where(eq(todoItems.taskKey, id));
            return true;
        });
    },
    async update(id, userId, input, correlationId) {
        return transaction(async tx => {
            const [current] = await tx.select().from(todoItems).where(eq(todoItems.taskKey, id)).for('update');
            if (!current) return undefined;
            if (current.userId !== userId) {
                // Project membership permits status changes, not general edits.
                const fields = Object.keys(input);
                if (!fields.length || fields.some(field => field !== 'status' && field !== 'completed')) return undefined;
                const [membership] = await tx.select({ projectId: projectMembers.projectId })
                    .from(projectItems)
                    .innerJoin(projectMembers, eq(projectMembers.projectId, projectItems.projectId))
                    .where(and(eq(projectItems.taskKey, id), eq(projectMembers.userId, userId)))
                    .limit(1).for('update');
                if (!membership) return undefined;
            }
            // Moving a card to Completed sends only `status`: the event follows
            // the derived `completed`, on the transition only.
            const changes = syncCompletion(input, current.status);
            await tx.update(todoItems).set(changes).where(eq(todoItems.taskKey, id));
            if (changes.completed && current.completed !== true) {
                await enqueue(tx, createEvent({
                    type: TASK_COMPLETED,
                    version: eventCatalog[TASK_COMPLETED].version,
                    aggregateId: String(id),
                    actorId: userId,
                    correlationId,
                    payload: { taskId: String(id), name: changes.name ?? current.name ?? '', completedAt: new Date().toISOString() },
                }));
            }
            return toTask({ ...current, ...changes });
        });
    },
    async remove(id, userId) {
        const [result] = await getDb().delete(todoItems).where(and(
            eq(todoItems.taskKey, id),
            or(eq(todoItems.userId, userId), sql`EXISTS (
                SELECT 1 FROM ${projectItems}
                INNER JOIN ${projectMembers} ON ${projectMembers.projectId} = ${projectItems.projectId}
                WHERE ${projectItems.taskKey} = ${todoItems.taskKey}
                AND ${projectMembers.userId} = ${userId}
            )`),
        ));
        return result.affectedRows === 1;
    },
    async listForUser(userId: string) {
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
                    status: todoItems.status,
                    projectName: projects.name,
                })
                .from(projectMembers)
                .innerJoin(
                    projects,
                    eq(projects.id, projectMembers.projectId),
                )
                .innerJoin(
                    projectItems,
                    eq(projectItems.projectId, projects.id),
                )
                .innerJoin(
                    todoItems,
                    eq(todoItems.taskKey, projectItems.taskKey),
                )
                .where(and(eq(projectMembers.userId, userId), isNotNull(todoItems.userId)))
        );
    },
};
