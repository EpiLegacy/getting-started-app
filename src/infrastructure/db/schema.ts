import { bigint, boolean, char, datetime, index, int, json, mysqlTable, primaryKey, unique, varchar } from 'drizzle-orm/mysql-core';
import { Priority } from '../../types';

/**
 * Legacy fields remain nullable and unchanged. taskKey uniquely identifies
 * each physical row, including rows with duplicate or NULL legacy ids.
 * userId = NULL means an existing task is available to claim.
 */
export const todoItems = mysqlTable('todo_items', {
    taskKey: int('task_key', { unsigned: true }).autoincrement().primaryKey(),
    userId: char('user_id', { length: 36 }).references(() => users.id, { onDelete: 'restrict' }),
    id: varchar('id', { length: 36 }),
    name: varchar('name', { length: 255 }),
    completed: boolean('completed'),
    deadline: varchar('deadline', { length: 255 }),
    priorisation: varchar('priorisation', { length: 255 }).$type<Priority>(),
}, table => [index('idx_todo_items_user').on(table.userId, table.taskKey)]);

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

/**
 * Accounts (#40). Created by migration 0001 only, like every table added
 * after the baseline: nothing in the application issues a CREATE TABLE.
 *
 * The email is stored trimmed and lowercased, and the column's collation
 * (utf8mb4_0900_ai_ci, the database default) compares case-insensitively, so
 * the unique key also rejects "Alice@x.io" once "alice@x.io" exists.
 * Only what authentication needs is kept: data minimisation is the default
 * the GDPR work (#21) builds on.
 */
export const users = mysqlTable('users', {
    id: char('id', { length: 36 }).notNull().primaryKey(),
    email: varchar('email', { length: 254 }).notNull().unique('uq_users_email'),
    // scrypt parameters, salt and hash in one string: see src/modules/auth/password.ts.
    passwordHash: varchar('password_hash', { length: 255 }).notNull(),
    createdAt: datetime('created_at', { fsp: 3 }).notNull(),
});

/**
 * Server-side sessions. The id is the SHA-256 of the token the browser holds
 * in its cookie, never the token itself: reading this table is not enough to
 * sign in as anyone. Deleting a user deletes their sessions.
 */
export const sessions = mysqlTable(
    'sessions',
    {
        id: char('id', { length: 64 }).notNull().primaryKey(),
        userId: char('user_id', { length: 36 })
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        createdAt: datetime('created_at', { fsp: 3 }).notNull(),
        expiresAt: datetime('expires_at', { fsp: 3 }).notNull(),
    },
    table => [index('idx_sessions_user').on(table.userId)],
);
