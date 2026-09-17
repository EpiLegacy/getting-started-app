import { eq } from 'drizzle-orm';
import { getDb, init as initDb, teardown as teardownDb, unwrapErrors } from '../infrastructure/db/drizzle';
import { todoItems } from '../infrastructure/db/schema';
import type { Item, Persistence, StoredItem } from '../types';

/**
 * Drizzle implementation of `Persistence`, behind PERSISTENCE_DRIVER=drizzle
 * (see src/persistence/index.ts). Reproduces src/persistence/mysql.ts's
 * behaviour exactly, quirks included: `completed` is truthy-coerced on
 * write and collapses to `false` for any stored value other than `true`
 * (NULL included); `name`/`completed` left out of the request body write
 * SQL NULL, matching mysql2's own `undefined` -> `NULL` serialisation
 * instead of Drizzle's "omit the column" default for `undefined`; `name` is
 * passed through unvalidated like the legacy adapter — this is an existing
 * behaviour, not something to fix here.
 *
 * init() only opens the pool: unlike the legacy adapter, it never creates
 * the table. Migrations are a separate step (npm run db:migrate).
 */

async function init(): Promise<void> {
    await initDb();
}

async function teardown(): Promise<void> {
    await teardownDb();
}

/**
 * Drizzle maps a NULL `completed` to `null`, not `false`. The legacy adapter
 * effectively coerces NULL to false too (`item.completed === 1`), so this
 * mirrors that instead of leaking `null` through the Persistence interface.
 */
function toStoredItem(row: { id: string | null; name: string | null; completed: boolean | null }): StoredItem {
    return { id: row.id as unknown as string, name: row.name, completed: row.completed === true };
}

/**
 * `undefined` writes SQL NULL, exactly like binding `undefined` to mysql2's
 * `?` placeholder does. Left as Drizzle would default it, `.set()`/`.values()`
 * would instead skip the column entirely — a no-op on UPDATE (the previous
 * value survives) rather than the unconditional overwrite the legacy adapter
 * performs.
 */
function nameValue(name: unknown): string | null {
    return (name ?? null) as string | null;
}

async function getItems(): Promise<StoredItem[]> {
    const rows = await unwrapErrors(() => getDb().select().from(todoItems));
    return rows.map(toStoredItem);
}

async function getItem(id: string): Promise<StoredItem | undefined> {
    const rows = await unwrapErrors(() => getDb().select().from(todoItems).where(eq(todoItems.id, id)));
    return rows.map(toStoredItem)[0];
}

async function storeItem(item: Item): Promise<void> {
    await unwrapErrors(() =>
        getDb()
            .insert(todoItems)
            .values({
                id: item.id,
                name: nameValue(item.name),
                completed: Boolean(item.completed),
            }),
    );
}

async function updateItem(id: string, item: Omit<Item, 'id'>): Promise<void> {
    await unwrapErrors(() =>
        getDb()
            .update(todoItems)
            .set({ name: nameValue(item.name), completed: Boolean(item.completed) })
            .where(eq(todoItems.id, id)),
    );
}

async function removeItem(id: string): Promise<void> {
    await unwrapErrors(() => getDb().delete(todoItems).where(eq(todoItems.id, id)));
}

const persistence: Persistence = { init, teardown, getItems, getItem, storeItem, updateItem, removeItem };

export = persistence;
