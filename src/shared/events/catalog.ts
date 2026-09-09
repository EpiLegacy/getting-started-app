import { z } from 'zod';

/**
 * The contract between producer and consumer. Both sides import these schemas,
 * so a breaking payload change fails the build instead of failing in production.
 */

export const TASK_COMPLETED = 'task.completed';

export const taskCompletedPayloadSchema = z.object({
    taskId: z.string().min(1),
    name: z.string(),
    completedAt: z.iso.datetime(),
});

export type TaskCompletedPayload = z.infer<typeof taskCompletedPayloadSchema>;

export const eventCatalog = {
    [TASK_COMPLETED]: { version: 1, payload: taskCompletedPayloadSchema },
} as const;

export type KnownEventType = keyof typeof eventCatalog;

export function isKnownEventType(type: string): type is KnownEventType {
    return Object.prototype.hasOwnProperty.call(eventCatalog, type);
}
