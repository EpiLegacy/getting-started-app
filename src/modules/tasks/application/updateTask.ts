import type { RowDataPacket } from 'mysql2/promise';
import { withTransaction } from '../../../infrastructure/db/mysql';
import { enqueue } from '../../../infrastructure/outbox/outboxRepository';
import { createEvent } from '../../../shared/events/envelope';
import {
    TASK_COMPLETED,
    eventCatalog,
    type TaskCompletedPayload,
} from '../../../shared/events/catalog';

interface TaskRow extends RowDataPacket {
    id: string;
    name: string;
    completed: number;
}

export interface UpdateTaskInput {
    id: string;
    name: string;
    completed: boolean;
    correlationId: string;
    actorId?: string | null;
}

export interface UpdatedTask {
    id: string;
    name: string;
    completed: boolean;
}

/**
 * Application service: the only place where a task change and its event are
 * written together. Routes call this instead of touching the database, which
 * is what makes the emission point testable without Express.
 */
export async function updateTask(input: UpdateTaskInput): Promise<UpdatedTask | undefined> {
    return withTransaction(async connection => {
        // Locked for the duration of the transaction so two concurrent
        // completions cannot both observe "not completed yet" and emit twice.
        const [rows] = await connection.query<TaskRow[]>(
            'SELECT id, name, completed FROM todo_items WHERE id = ? FOR UPDATE',
            [input.id],
        );
        const current = rows[0];
        if (!current) return undefined;

        await connection.execute(
            'UPDATE todo_items SET name = ?, completed = ? WHERE id = ?',
            [input.name, input.completed ? 1 : 0, input.id],
        );

        // An event is a fact, so it is emitted on the TRANSITION only. Saving
        // an already-completed task changes nothing and must stay silent.
        const wasCompleted = current.completed === 1;
        if (input.completed && !wasCompleted) {
            const payload: TaskCompletedPayload = {
                taskId: input.id,
                name: input.name,
                completedAt: new Date().toISOString(),
            };

            await enqueue(
                connection,
                createEvent({
                    type: TASK_COMPLETED,
                    version: eventCatalog[TASK_COMPLETED].version,
                    aggregateId: input.id,
                    payload,
                    correlationId: input.correlationId,
                    actorId: input.actorId ?? null,
                }),
            );
        }

        return { id: input.id, name: input.name, completed: input.completed };
    });
}
