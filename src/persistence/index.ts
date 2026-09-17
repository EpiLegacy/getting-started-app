import { z } from 'zod';
import type { Persistence } from '../types';

/**
 * legacy: src/persistence/mysql.ts, the hand-written mysql2 adapter.
 * drizzle: src/persistence/drizzle.ts, added in ADR 0001's lot 3.
 * Only takes effect when MySQL is configured at all (MYSQL_HOST set); SQLite
 * is unaffected and still used otherwise.
 */
const DriverSchema = z.enum(['legacy', 'drizzle']).default('legacy');

function resolveDriver(): z.infer<typeof DriverSchema> {
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
    return parsed.data;
}

// Validated unconditionally: a misconfigured PERSISTENCE_DRIVER must refuse
// to start even when MYSQL_HOST is unset and SQLite is what actually runs.
const driver = resolveDriver();

const persistence: Persistence = !process.env.MYSQL_HOST
    ? require('./sqlite')
    : driver === 'drizzle'
      ? require('./drizzle')
      : require('./mysql');

export = persistence;
