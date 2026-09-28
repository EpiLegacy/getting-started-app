/**
 * Applies the migrations in drizzle/ from the runtime image.
 *
 *   node build/scripts/migrate.js
 *
 * `npm run db:migrate` needs drizzle-kit, a dev dependency the runtime image
 * does not ship. This runs drizzle-orm's own migrator instead: it reads the
 * same journal and records progress in the same `__drizzle_migrations` table,
 * so a database migrated by one is up to date for the other. A deployment can
 * then run the exact image it is about to start, rather than a second image
 * that would have to be built, published and kept in step with the first.
 */
import path from 'node:path';
import { migrate } from 'drizzle-orm/mysql2/migrator';
import { getDb, init, teardown } from '../infrastructure/db/drizzle';

// build/scripts/migrate.js -> /app/drizzle in the image, ./drizzle locally.
const MIGRATIONS_FOLDER = path.resolve(__dirname, '../../drizzle');

async function main(): Promise<void> {
    await init();
    try {
        await migrate(getDb(), { migrationsFolder: MIGRATIONS_FOLDER });
        console.log('Migrations applied');
    } finally {
        await teardown();
    }
}

main().catch((err: unknown) => {
    console.error(err);
    process.exit(1);
});
