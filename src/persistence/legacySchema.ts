import { boolean, mysqlTable, varchar } from 'drizzle-orm/mysql-core';
import type { Priority } from '../types';

/**
 * Column subset for the archived anonymous Persistence contract and migration
 * tools. It works before and after the ownership migration; Drizzle inserts
 * otherwise include DEFAULT for every new column, even on older databases.
 * This is not the migration schema or the authenticated task repository.
 */
export const legacyTodoItems = mysqlTable('todo_items', {
    id: varchar('id', { length: 36 }),
    name: varchar('name', { length: 255 }),
    completed: boolean('completed'),
    deadline: varchar('deadline', { length: 255 }),
    priorisation: varchar('priorisation', { length: 255 }).$type<Priority>(),
});
