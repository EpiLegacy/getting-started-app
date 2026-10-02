import type { Item, Priority, TaskStatus } from '../../types';

/** Public id is the stable task_key, not the non-unique legacy id column. */
export interface Task extends Item {
    userId: string | null;
    projectId?: string | null;
}

export interface TaskForUser {
    taskKey: number;
    id: string | null;
    userId: string | null;
    name: string | null;
    completed: boolean | null;
    deadline: string | null;
    priorisation: Priority | null;
    projectName: string;
    status?: TaskStatus;
}

export type TaskInput = Omit<Item, 'id'>;

export interface TaskRepository {
    list(userId: string): Promise<Task[]>;
    listUnassigned(userId: string): Promise<Task[]>;
    create(userId: string, input: TaskInput): Promise<Task>;
    claim(id: number, userId: string, projectId: string, assigneeId: string): Promise<boolean>;
    update(id: number, userId: string, input: Partial<TaskInput>, correlationId: string): Promise<Task | undefined>;
    remove(id: number, userId: string): Promise<boolean>;
    listForUser(userId: string): Promise<TaskForUser[]>;
}
