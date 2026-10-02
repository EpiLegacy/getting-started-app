import type { TaskStatus } from '../../types';
import type { TaskInput } from './types';

/**
 * `status` is the Kanban column and the source of truth. `completed` is kept
 * for existing clients and the home screen, and always follows it, so the
 * board, the home screen and the task.completed event agree.
 *
 * A client may send either field: moving a card sends only `status`, older
 * clients send only `completed`. The routes reject a request that sends both
 * with values that disagree.
 */
export function syncCompletion<T extends Partial<TaskInput>>(input: T, currentStatus: TaskStatus = 'todo'): T {
    if (input.status !== undefined) {
        return { ...input, completed: input.status === 'completed' };
    }
    if (input.completed === true) {
        return { ...input, status: 'completed' as const };
    }
    // Reopening a completed task puts it back in the first column. Any other
    // column already means "not completed", so the card stays where it is.
    if (input.completed === false && currentStatus === 'completed') {
        return { ...input, status: 'todo' as const };
    }
    return input;
}

/** True when a request sets both fields and they contradict each other. */
export function contradictsStatus(input: Partial<TaskInput>): boolean {
    return input.completed !== undefined && input.status !== undefined
        && input.completed !== (input.status === 'completed');
}
