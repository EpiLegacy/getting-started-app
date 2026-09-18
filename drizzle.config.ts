import { readFileSync } from 'node:fs';
import { defineConfig } from 'drizzle-kit';

/**
 * Configuration for drizzle-kit (db:generate, db:migrate, db:check — see
 * package.json and docs/adr/0001-adopter-drizzle-orm.md). Never run at
 * application start-up: migrations are a separate, explicit deployment step.
 *
 * Credentials come only from the environment or *_FILE files, mirroring
 * src/infrastructure/db/mysql.ts and src/persistence/mysql.ts. Nothing here
 * is a secret: this file only reads variable NAMES.
 */
function env(name: string): string | undefined {
    const file = process.env[`${name}_FILE`];
    return file ? readFileSync(file, 'utf8') : process.env[name];
}

export default defineConfig({
    dialect: 'mysql',
    schema: './src/infrastructure/db/schema.ts',
    out: './drizzle',
    dbCredentials: {
        host: env('MYSQL_HOST') ?? 'localhost',
        port: env('MYSQL_PORT') ? Number(env('MYSQL_PORT')) : undefined,
        user: env('MYSQL_USER'),
        password: env('MYSQL_PASSWORD'),
        database: env('MYSQL_DB') ?? 'todos',
    },
});
