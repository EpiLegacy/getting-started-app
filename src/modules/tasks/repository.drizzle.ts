import { randomUUID } from 'node:crypto';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { getDb, transaction } from '../../infrastructure/db/drizzle';
import { todoItems } from '../../infrastructure/db/schema';
import { enqueue } from '../../infrastructure/outbox/outboxRepository.drizzle';
import { createEvent } from '../../shared/events/envelope';
import { TASK_COMPLETED, eventCatalog } from '../../shared/events/catalog';
import type { Task, TaskRepository } from './types';

function toTask(row: typeof todoItems.$inferSelect): Task {
    return {
        id: String(row.taskKey),
        userId: row.userId,
        name: row.name ?? '',
        completed: row.completed === true,
        deadline: row.deadline ?? '',
        priorisation: row.priorisation ?? 'medium',
    };
}

const owned = (id: number, userId: string) => and(eq(todoItems.taskKey, id), eq(todoItems.userId, userId));

/** Authenticated tasks always use MySQL, just like users and sessions. */
export const taskRepository: TaskRepository = {
    async list(userId) {
        const rows = await getDb().select().from(todoItems)
            .where(eq(todoItems.userId, userId)).orderBy(asc(todoItems.taskKey));
        return rows.map(toTask);
    },
    async listUnassigned() {
        const rows = await getDb().select().from(todoItems)
            .where(isNull(todoItems.userId)).orderBy(asc(todoItems.taskKey));
        return rows.map(toTask);
    },
    async create(userId, input) {
        const [{ taskKey }] = await getDb().insert(todoItems)
            .values({ ...input, id: randomUUID(), userId }).$returningId();
        return { ...input, id: String(taskKey), userId };
    },
    async claim(id, userId) {
        // One conditional write: competing claims cannot overwrite the winner.
        const [result] = await getDb().update(todoItems).set({ userId })
            .where(and(eq(todoItems.taskKey, id), isNull(todoItems.userId)));
        return result.affectedRows === 1;
    },
    async update(id, userId, input, correlationId) {
        return transaction(async tx => {
            const [current] = await tx.select().from(todoItems).where(owned(id, userId)).for('update');
            if (!current) return undefined;
            await tx.update(todoItems).set(input).where(owned(id, userId));
            if (input.completed && current.completed !== true) {
                await enqueue(tx, createEvent({
                    type: TASK_COMPLETED,
                    version: eventCatalog[TASK_COMPLETED].version,
                    aggregateId: String(id),
                    actorId: userId,
                    correlationId,
                    payload: { taskId: String(id), name: input.name ?? current.name ?? '', completedAt: new Date().toISOString() },
                }));
            }
            return toTask({ ...current, ...input });
        });
    },
    async remove(id, userId) {
        const [result] = await getDb().delete(todoItems).where(owned(id, userId));
        return result.affectedRows === 1;
    },
};
