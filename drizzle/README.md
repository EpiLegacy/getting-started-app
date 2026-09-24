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

## Baseline rollback

The baseline does not drop or alter existing columns (see ADR 0001).
The baseline only describes tables that already exist, so there is nothing to
roll back: reverting to `PERSISTENCE_DRIVER=legacy` (see `src/persistence`)
needs no migration change either way. Future schema changes follow the
expand/contract model, which keeps every migration compatible with the
previous version of the code and reversible the same way.

## Task ownership (`0002_task_ownership.sql`)

Existing tasks remain in `todo_items`, with `user_id = NULL`. Signed-in users
can list and claim these tasks; claiming removes the task from the shared list
and gives only the claimant permission to edit or delete it. New tasks always
belong to the session user. Direct database deletion of an account is restricted while tasks refer to it.
The authenticated `DELETE /auth/me` endpoint verifies the current password and
deletes owned tasks and the account in one transaction; sessions cascade. Tasks
never become unassigned as a side effect of account deletion. No additional schema
migration is needed for the profile page or this deletion endpoint. Existing
operational event history is not purged by this endpoint.

The legacy `id` column allows duplicates and NULLs. A new `task_key`
AUTO_INCREMENT primary key gives every existing row its own identity without
rewriting or discarding any legacy values. The authenticated API exposes this
key as a string `id`; clients must use the returned IDs, not cached legacy IDs.
The ownership index covers both per-user and unassigned lists.

The migration also reconciles `deadline` and `priorisation`: the earlier
`0001_complex_ben_urich.sql` was not in the journal, although some deployments
applied it manually. Migration 0002 adds those columns only where missing. Do
not manually run every SQL file; `npm run db:migrate` follows the journal.

Deployment:

1. Stop application writers and back up the database. Adding the generated key
   rebuilds the table, so plan a maintenance window appropriate to its size.
2. If tasks remain in SQLite, use the existing `db:merge-sqlite` dry run/apply
   workflow before enabling accounts, and resolve its reported conflicts.
3. Run `npm run db:migrate` with the intended MySQL connection variables.
4. Compare task counts and legacy field values with the backup. All migrated
   tasks should still have NULL owners and distinct non-NULL task keys.
5. Start the new application. Register/sign in, then claim tasks from the shared
   unassigned list. Do not run older anonymous API instances alongside it.

No migration is run by the API at startup. This change keeps all task rows and
legacy values; it adds constraints only to the new key and ownership columns.
After users start claiming tasks, rolling back to the anonymous API would expose
private tasks. Keep the authenticated API in place or take it offline while
preparing an ownership-aware rollback; switching the persistence flag is not a
security rollback. Task HTTP routes use Drizzle regardless of that flag, as the
authentication routes already do.
