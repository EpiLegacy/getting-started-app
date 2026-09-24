import type { Item } from '../../types';

/** Public id is the stable task_key, not the non-unique legacy id column. */
export interface Task extends Item {
    userId: string | null;
}

export type TaskInput = Omit<Item, 'id'>;

export interface TaskRepository {
    list(userId: string): Promise<Task[]>;
    listUnassigned(): Promise<Task[]>;
    create(userId: string, input: TaskInput): Promise<Task>;
    claim(id: number, userId: string): Promise<boolean>;
    update(id: number, userId: string, input: Partial<TaskInput>, correlationId: string): Promise<Task | undefined>;
    remove(id: number, userId: string): Promise<boolean>;
}
