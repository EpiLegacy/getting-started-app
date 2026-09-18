import { z } from 'zod';

/**
 * legacy: the hand-written mysql2 adapters (src/persistence/mysql.ts,
 * src/infrastructure/db/mysql.ts, src/infrastructure/outbox/*).
 * drizzle: their Drizzle counterparts, added in ADR 0001's lots 3-4.
 *
 * Read by every MySQL entry point (src/persistence/index.ts,
 * src/routes/updateItem.ts, src/index.ts, src/workers/notifications/index.ts)
 * so all of them agree, and so a typo is caught at start-up in the API and
 * the worker alike, rather than in whichever process happens to touch the
 * database first.
 */
const DriverSchema = z.enum(['legacy', 'drizzle']).default('legacy');
export type PersistenceDriver = z.infer<typeof DriverSchema>;

let resolved: PersistenceDriver | undefined;

export function resolvePersistenceDriver(): PersistenceDriver {
    if (resolved) return resolved;

    const parsed = DriverSchema.safeParse(process.env.PERSISTENCE_DRIVER);
    if (!parsed.success) {
        // No route or module has run yet: a plain, one-line message on
        // stderr is more useful here than a Zod issue dump or a stack trace.
        console.error(
            `Invalid PERSISTENCE_DRIVER "${process.env.PERSISTENCE_DRIVER}": ` +
                'expected "legacy" or "drizzle" (or unset, which defaults to "legacy").',
        );
        process.exit(1);
    }
    resolved = parsed.data;
    return resolved;
}
