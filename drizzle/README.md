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

Verified on 2026-09-17 against a throwaway MySQL 8.4.11:

- Applying this migration to an **empty** database and running
  `SHOW CREATE TABLE` on all four tables reproduces production's DDL
  byte for byte (charset/collation included — inherited from the database's
  own default, not stated explicitly in the migration).
- Running `db:generate` a second time with no schema change prints
  `No schema changes, nothing to migrate` — proof that `schema.ts` and this
  migration agree.

## Marking the baseline as applied on an existing database, without running it

Production's tables already exist. Running `db:migrate` there unmodified
would execute `CREATE TABLE todo_items (...)` etc. against tables that are
already present, and fail. Instead, the migration is recorded as already
applied, and only the migration is skipped — the data is never touched.

`db:migrate` matches a migration file against a row in `__drizzle_migrations`
by the SHA-256 hash of the `.sql` file's content (`created_at` records when,
in epoch milliseconds — used for ordering, not for the match itself). To mark
`0000_silky_leo.sql` as applied:

```sql
CREATE TABLE IF NOT EXISTS `__drizzle_migrations` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `hash` text NOT NULL,
  `created_at` bigint,
  PRIMARY KEY (`id`)
);

INSERT INTO `__drizzle_migrations` (hash, created_at)
VALUES ('<sha256sum of drizzle/0000_silky_leo.sql>', <"when" from drizzle/meta/_journal.json, entry idx 0>);
```

Both values are printed by:

```bash
sha256sum drizzle/0000_silky_leo.sql
node -e "console.log(require('./drizzle/meta/_journal.json').entries[0].when)"
```

**Verified** on 2026-09-17: a throwaway database was seeded with the exact
`CREATE TABLE IF NOT EXISTS` statements `src/infrastructure/db/mysql.ts` and
the legacy `persistence/mysql.ts` run today, plus one row of data. After
running the SQL above, `npm run db:migrate` reported success without
attempting to recreate the tables, and the seeded row was still present
afterwards. This has never been run against the `legacy-kanban` (production)
database itself — only against a disposable copy of its schema.

## Rollback

No migration in this folder is destructive (no `DROP`, type change, added
`NOT NULL` or `PRIMARY KEY` — see ADR 0001, "Aucune migration destructive").
The baseline only describes tables that already exist, so there is nothing to
roll back: reverting to `PERSISTENCE_DRIVER=legacy` (see `src/persistence`)
needs no migration change either way. Future schema changes follow the
expand/contract model, which keeps every migration compatible with the
previous version of the code and reversible the same way.
