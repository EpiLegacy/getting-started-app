# Drizzle migrations

Migrations run as a separate deployment step (`npm run db:migrate`), **never**
at application start-up (`src/index.ts` does not call it).

## Scripts

- `npm run db:generate` — diffs `src/infrastructure/db/schema.ts` against the
  migration history in this folder and writes a new SQL file when they
  differ. Schema-only: it does not connect to a database.
- `npm run db:migrate` — applies the pending migrations in `drizzle/*.sql`,
  in order, tracked in the `__drizzle_migrations` table.
- `npm run db:check` — fails if the migration history itself is inconsistent
  (e.g. two migrations edited to claim the same position). Run in CI.

All three read the same connection variables as the application
(`MYSQL_HOST`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DB`, and their
`*_FILE` counterparts — see `drizzle.config.ts`).

## Baseline migration (`0000_silky_leo.sql`)

Declares the four tables exactly as production already has them (captured by
`scripts/db/inspect.sql` on 2026-09-17): `todo_items` with no primary key and
every column nullable, `outbox_events`, `notifications`, `processed_events`.
`todo_items_merge_conflicts` is intentionally absent — production never ran
the SQLite merge script, so that table does not exist there.

Every baseline `CREATE TABLE` uses `IF NOT EXISTS`. This is required because
older application versions created some of these tables at startup and MySQL
auto-commits DDL: an interrupted or mixed-version setup may therefore contain
only part of the baseline. Re-running `db:migrate` completes that state without
dropping tables or data, then records the migration normally.

Verified on 2026-09-17 against a throwaway MySQL 8.4.11:

- Applying this migration to an **empty** database and running
  `SHOW CREATE TABLE` on all four tables reproduces production's DDL
  byte for byte (charset/collation included — inherited from the database's
  own default, not stated explicitly in the migration).
- Running `db:generate` a second time with no schema change prints
  `No schema changes, nothing to migrate` — proof that `schema.ts` and this
  migration agree.

## Applying the baseline to an existing database

Run `npm run db:migrate` normally. Existing tables and their data are left
untouched; missing baseline tables are created, and Drizzle records the
migration after all statements succeed. As with any baseline, first verify
that an existing production schema matches `src/infrastructure/db/schema.ts`.

## Rollback

No migration in this folder is destructive (no `DROP`, type change, added
`NOT NULL` or `PRIMARY KEY` — see ADR 0001, "Aucune migration destructive").
The baseline only describes tables that already exist, so there is nothing to
roll back: reverting to `PERSISTENCE_DRIVER=legacy` (see `src/persistence`)
needs no migration change either way. Future schema changes follow the
expand/contract model, which keeps every migration compatible with the
previous version of the code and reversible the same way.
