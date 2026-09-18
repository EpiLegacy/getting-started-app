import { eq } from 'drizzle-orm';
import { transaction } from '../../../infrastructure/db/drizzle';
import { enqueue } from '../../../infrastructure/outbox/outboxRepository.drizzle';
import { todoItems } from '../../../infrastructure/db/schema';
import { createEvent } from '../../../shared/events/envelope';
import { TASK_COMPLETED, eventCatalog, type TaskCompletedPayload } from '../../../shared/events/catalog';
import type { UpdatedTask, UpdateTaskInput } from './updateTask';

/**
 * Drizzle counterpart of updateTask.ts, selected by
 * PERSISTENCE_DRIVER=drizzle (see src/routes/updateItem.ts). Same contract:
 * task and event committed together, `FOR UPDATE` held for the transaction,
 * an event only on the not-completed -> completed transition.
 */
/**
 * The legacy adapter's UPDATE binds `name` through mysql2's `.execute()`
 * (prepared statements), which JSON-serialises a plain object or array
 * parameter (`{a:1}` -> `'{"a":1}'`). Drizzle's UPDATE goes through mysql2's
 * `.query()` instead, which would stringify the same value as the unhelpful
 * `"[object Object]"` — verified against mysql2 directly, not guessed.
 * Reproduced here so a name of that shape ends up stored identically either
 * way; every other type (string, number, boolean, null) already matches
 * between the two mysql2 code paths and needs no help.
 */
function nameForUpdate(name: string): unknown {
    return name !== null && typeof name === 'object' ? JSON.stringify(name) : name;
}

export async function updateTask(input: UpdateTaskInput): Promise<UpdatedTask | undefined> {
    return transaction(async tx => {
        // Locked for the duration of the transaction so two concurrent
        // completions cannot both observe "not completed yet" and emit twice.
        const rows = await tx.select().from(todoItems).where(eq(todoItems.id, input.id)).for('update');
        const current = rows[0];
        if (!current) return undefined;

        // input.name is typed as a string but, like the legacy path, carries
        // whatever req.body.name was: mysql2's `.execute()` (what the legacy
        // adapter's UPDATE uses) rejects an undefined bind parameter instead
        // of writing NULL, and that 500 is one of the pinned "current
        // behaviour, to be fixed" tests. Drizzle's `.set()` would instead
        // silently drop the column from the UPDATE, leaving the old name in
        // place — a different, quieter outcome — so the same rejection is
        // reproduced explicitly here, at the same point as the legacy one:
        // after the lookup, so an unknown id still answers 404.
        if (input.name === undefined) {
            throw new TypeError('Bind parameters must not contain undefined. To pass SQL NULL specify JS null');
        }

        await tx
            .update(todoItems)
            .set({ name: nameForUpdate(input.name) as string, completed: Boolean(input.completed) })
            .where(eq(todoItems.id, input.id));

        // An event is a fact, so it is emitted on the TRANSITION only. Saving
        // an already-completed task changes nothing and must stay silent.
        const wasCompleted = current.completed === true;
        if (input.completed && !wasCompleted) {
            const payload: TaskCompletedPayload = {
                taskId: input.id,
                name: input.name,
                completedAt: new Date().toISOString(),
            };

            await enqueue(
                tx,
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
