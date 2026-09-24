# Drizzle migrations and legacy data import

[Back to README](../README.md) · [API reference](../docs/api.md)

- [Move from legacy SQLite to MySQL](#move-from-legacy-sqlite-to-mysql)
- [Migration scripts](#scripts)
- [Baseline migration](#baseline-migration-0000_silky_leosql)
- [Task ownership](#task-ownership-0002_task_ownershipsql)

## Move from legacy SQLite to MySQL

Use Node.js 24, `npm ci`, and a reachable MySQL 8.4 database. Import legacy
rows before enabling accounts or allowing users to claim tasks. Run commands
from the repository root. For a new local target, copy `.env.example` to `.env`
if needed, then start **only MySQL**:

```sh
docker compose up -d --wait mysql
```

1. Stop all application instances, workers, and other writers using the source
   SQLite or target MySQL databases. For the Compose stack, use
   `docker compose stop api worker`. Keep MySQL running. Back up the target
   MySQL database with your normal backup procedure and retain the original
   SQLite database, including any journal/WAL sidecar files. Plan a maintenance
   window: the ownership migration rebuilds `todo_items`.
2. Locate the actual SQLite file. The current app defaults to `data/todo.db`,
   but the importer defaults to `/etc/todos/todo.db` (or `SQLITE_DB_LOCATION`).
   **Pass `--sqlite` explicitly** to avoid importing the wrong file. If the file
   is inside a container or volume, copy it and its sidecars while writers are
   stopped to a location accessible to this command.
3. Export the target connection settings. The importer and Drizzle CLI do not
   automatically load `.env`. For a trusted, shell-compatible local `.env`:

   ```sh
   set -a
   . ./.env
   set +a
   export MYSQL_HOST=127.0.0.1
   ```

   Set `MYSQL_USER`, `MYSQL_PASSWORD`, and `MYSQL_DB` to your intended target;
   the database must already exist. Compose creates it on first initialization.
   For a remote target, use its hostname and credentials instead.
4. Run the default dry run (replace the SQLite path):

   ```sh
   npm run db:merge-sqlite -- --sqlite /absolute/path/to/todo.db \
     --mysql-port "${MYSQL_PORT:-3306}" --report /tmp/kanban-merge-dry-run.json
   ```

   This reads both databases without modifying them and writes a JSON report.
   Review `summary.toInsert`, `alreadyPresent`, `exactDuplicatesInSqlite`, and
   `conflicts`, plus the detailed conflict rows. Report paths must be new and
   their parent directories must exist: the script refuses to overwrite files.
5. Apply the reviewed import while writers remain stopped:

   ```sh
   npm run db:merge-sqlite -- --apply --sqlite /absolute/path/to/todo.db \
     --mysql-port "${MYSQL_PORT:-3306}" --backup-dir ./backups/sqlite \
     --report /tmp/kanban-merge-applied.json
   ```

   Apply creates a timestamped SQLite copy (including existing sidecars), then
   inserts compatible rows and saves conflicts in `todo_items_merge_conflicts`.
   It never updates or deletes existing MySQL rows. Before committing, it checks
   that each source row is represented by a target row or a recorded conflict.
   Data writes roll back if verification fails; table creation occurs before
   that transaction. The report is written **after commit**, so a report-write
   failure does not mean the import rolled back. Re-running the importer is
   idempotent; use a fresh report filename.
6. Review and resolve conflicts manually before opening the app to users. The
   report includes the source row, reason, and relevant MySQL values; the
   conflict table preserves these for review. Reasons include invalid values,
   overlong fields, differing MySQL rows with the same ID, and differing SQLite
   rows sharing an ID. Conflicts are **not** visible as tasks in the app. There
   is no automatic conflict-resolution command: reconcile each row according
   to the intended data, preserving the report and backups.
7. Apply the schema migrations using the same target variables:

   ```sh
   npm run db:migrate
   ```

   This creates the account/session tables and gives tasks generated keys and
   nullable ownership. Do not execute every SQL file manually: the journal is
   authoritative, and `0001_complex_ben_urich.sql` is not journaled.
8. Verify the import report against source values and the target. In a MySQL
   client connected to the target database, check:

   ```sql
   SELECT COUNT(*) AS total,
          COUNT(task_key) AS with_key,
          COUNT(DISTINCT task_key) AS distinct_keys,
          SUM(user_id IS NULL) AS unassigned
   FROM todo_items;
   SELECT reason, COUNT(*) FROM todo_items_merge_conflicts GROUP BY reason;
   ```

   Every task must have a distinct non-NULL key. On a legacy target with no
   accounts/claims, all tasks should be unassigned. Compare field values too:
   identical source duplicates are collapsed, and conflicts are stored
   separately, so source and target task counts need not match.
9. Start the full stack with `docker compose up --build -d`, or follow the
   [local development setup](../README.md#local-development). Register/sign in,
   open the unassigned task list, and claim an imported task. Retain backups
   and reports until verification is complete. Do not run the old anonymous
   API alongside the authenticated application.

### Import scope and options

The importer reads **only `id`, `name`, and `completed`** from SQLite's
`todo_items`. It does not migrate accounts, ownership, deadlines, priorities,
or other tables. If your SQLite database has additional fields, retain them in
backups and plan their separate transfer before cutover. Identical duplicate
rows are represented once; differing rows with the same ID become conflicts.

| Option | Default / purpose |
| --- | --- |
| `--apply` | Omit for a dry run; include to write MySQL data and back up SQLite. |
| `--sqlite <path>` | `SQLITE_DB_LOCATION`, otherwise `/etc/todos/todo.db`. |
| `--mysql-port <port>` | `3306`; the importer does not read `MYSQL_PORT` automatically. |
| `--backup-dir <dir>` | Next to the SQLite file; created on apply if needed. |
| `--report <path>` | `./merge-report-<timestamp>.json`; must not already exist. |

The importer supports `MYSQL_HOST`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DB`,
and their `*_FILE` variants. Backups/reports contain task data; keep them out of
commits and retain them in an appropriate storage location.

## Migration lifecycle

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

The configuration reads `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`,
`MYSQL_PASSWORD`, `MYSQL_DB`, and their `*_FILE` counterparts (file values take
precedence; see `drizzle.config.ts`). Export these before running the CLI.
`db:generate` and `db:check` do not require a live database.

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
that existing tables match the baseline SQL. The current
`src/infrastructure/db/schema.ts` also includes later migrations.

## Baseline rollback

The baseline does not drop or alter existing columns (see ADR 0001).
The baseline is additive and needs no schema rollback when changing persistence
adapters. This does not make a rollback to an older application safe after
ownership is enabled: see the ownership warning below. Prefer additive schema
changes and assess rollback compatibility for each migration.

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
