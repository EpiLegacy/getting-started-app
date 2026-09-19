import { bigint, boolean, char, datetime, index, int, json, mysqlTable, primaryKey, unique, varchar } from 'drizzle-orm/mysql-core';
import { Priority } from '../../static/js/api';

/**
 * Declares the database exactly as production has it today (captured by
 * scripts/db/inspect.sql on 2026-09-17, MySQL 8.4.11, utf8mb4 /
 * utf8mb4_0900_ai_ci). Nothing here is "corrected": no primary key or
 * NOT NULL is added to `todoItems`, and `todoItemsMergeConflicts` (never
 * created in production - the SQLite merge was never run) is intentionally
 * left out. Any future schema change follows the expand/contract model from
 * ADR 0001 instead of editing a column in place.
 */

// No primary key, every column nullable: matches `CREATE TABLE todo_items
// (id varchar(36), name varchar(255), completed boolean)` exactly, including
// duplicate ids and NULL columns that the legacy adapters already produce.
export const todoItems = mysqlTable('todo_items', {
    id: varchar('id', { length: 36 }),
    name: varchar('name', { length: 255 }),
    completed: boolean('completed'),
    deadline: varchar('deadline', { length: 255 }),
    priorisation: varchar('priorisation', { length: 255 }).$type<Priority>(),
});

export const outboxEvents = mysqlTable(
    'outbox_events',
    {
        id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
        eventId: char('event_id', { length: 36 }).notNull(),
        type: varchar('type', { length: 120 }).notNull(),
        version: int('version', { unsigned: true }).notNull(),
        aggregateId: varchar('aggregate_id', { length: 64 }).notNull(),
        correlationId: varchar('correlation_id', { length: 64 }).notNull(),
        actorId: varchar('actor_id', { length: 64 }),
        occurredAt: datetime('occurred_at', { fsp: 3 }).notNull(),
        payload: json('payload').notNull(),
        publishedAt: datetime('published_at', { fsp: 3 }),
    },
    table => [
        // Matches production's "UNIQUE KEY event_id (event_id)": MySQL names
        // a single-column unique key after the column by default, so this
        // name is made explicit instead of left to chance.
        unique('event_id').on(table.eventId),
        index('idx_outbox_unpublished').on(table.publishedAt, table.id),
    ],
);

export const notifications = mysqlTable(
    'notifications',
    {
        id: char('id', { length: 36 }).notNull().primaryKey(),
        recipientId: varchar('recipient_id', { length: 64 }).notNull(),
        type: varchar('type', { length: 120 }).notNull(),
        body: varchar('body', { length: 500 }).notNull(),
        readAt: datetime('read_at', { fsp: 3 }),
        createdAt: datetime('created_at', { fsp: 3 }).notNull(),
    },
    table => [index('idx_notifications_recipient').on(table.recipientId, table.createdAt)],
);

export const processedEvents = mysqlTable(
    'processed_events',
    {
        eventId: char('event_id', { length: 36 }).notNull(),
        handler: varchar('handler', { length: 120 }).notNull(),
        processedAt: datetime('processed_at', { fsp: 3 }).notNull(),
    },
    table => [primaryKey({ columns: [table.eventId, table.handler] })],
);
