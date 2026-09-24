# ADR 0001 — Adopt Drizzle ORM for persistence

- **Status:** Proposed (original record; implementation has since progressed)
- **Date:** 2026-09-17
- **Decision makers:** To be completed
- **Supersedes:** The “Prisma, TypeORM, or Sequelize” recommendation in audit section 7.2
- **Related documents:** [Audit](../../Audit%20translate.md), sections 2.2, 7.2, 7.3, and 7.8; [SQLite importer](../../src/scripts/mergeSqliteIntoMysql/); [migration guide](../../drizzle/README.md)

## Context

The application is in production. The audit identified several persistence problems:

1. **Duplicated queries.** `src/persistence/sqlite.ts` and `src/persistence/mysql.ts` implement the same operations: `getItems`, `getItem`, `storeItem`, `updateItem`, and `removeItem`. The presence of `MYSQL_HOST` selects the database engine.
2. **No migrations.** Handwritten `CREATE TABLE IF NOT EXISTS` statements create tables at startup. The legacy `todo_items` table has neither a primary key nor `NOT NULL` constraints.
3. **Two MySQL access paths.** Event infrastructure in `src/infrastructure/db/mysql.ts` uses a separate `mysql2/promise` pool because the legacy adapter does not support transactions.
4. **An existing transactional outbox.** `updateTask` writes the task and its event in one transaction and locks the row with `SELECT … FOR UPDATE`. The relay claims events with `FOR UPDATE SKIP LOCKED` to support multiple instances.
5. **MySQL 8.4 is the target engine**, as configured in `docker-compose.yml`. Removing SQLite would also remove the native `sqlite3` dependency, which requires Python, make, and g++ during image builds.
6. **The stack** uses strict TypeScript, Node 24, Express 5, Zod, and a multistage Docker image compiled with `tsc`.

The audit recommends an ORM with versioned migrations but leaves the choice between Prisma, TypeORM, and Sequelize open.

This context describes the situation at the time of the proposal. The implementation notes below distinguish the original plan from subsequent changes.

## Decision criteria

- **C1 — Locks and transactions.** Express `FOR UPDATE` and `FOR UPDATE SKIP LOCKED` in interactive transactions through a typed API, because the outbox depends on them.
- **C2 — TypeScript typing.** Infer query result types without manual casts.
- **C3 — Versioned migrations.** Produce reviewable SQL and support an existing database without recreating its tables.
- **C4 — Incremental migration.** Reuse `mysql2`, coexist with production code, and switch one module at a time.
- **C5 — Build and image impact.** Avoid an additional native binary or client code-generation step.
- **C6 — SQL control.** Preserve requirements such as `DATETIME(3)`, JSON columns, composite indexes, and `utf8mb4`.
- **C7 — Validation.** Allow Zod schemas to be derived from the data model.

## Options considered

The assessments below record the team's evaluation for this project at the time of the proposal, rather than a permanent ranking of these libraries.

### A — Drizzle ORM (selected)

A TypeScript schema, a SQL-oriented API, and migrations managed with `drizzle-kit`.

- **C1:** The MySQL query builder exposes `.for('update')` and `.for('update', { skipLocked: true })`, with transactions through `db.transaction(async tx => …)`.
- **C2:** Types are inferred from the schema without generating a client.
- **C3:** `drizzle-kit generate` produces reviewable SQL; introspection can establish a schema from an existing database.
- **C4:** It uses the existing `mysql2` driver. The transaction, enqueue, batch-claim, and task-update operations can retain their structure.
- **C5:** It does not require a native ORM runtime or a separate client-generation step. Generating SQL migrations remains an explicit development task.
- **C6:** Its API keeps the executed SQL visible and understandable.
- **C7:** Table definitions can support derived Zod schemas; this is an option, not a requirement to replace explicit request validation.

Tradeoffs include database-specific schema definitions (`mysqlTable` differs from `sqliteTable`), a less extensive high-level relational API than the team sought in Prisma, and API evolution that warrants pinned versions.

### B — Prisma

A `schema.prisma` file and generated client.

The team valued its developer experience, readable schema, migration tooling, and community. Database portability was also attractive in the audit, and existing code comments anticipated Prisma.

For this project, the main concern was expressing the outbox's locking operations through raw queries inside transactions, reducing the benefit of typed queries in the most sensitive code. Client generation would add a build/CI/Docker step, and the abstraction would put more distance between application code and SQL.

The assessment was that Prisma was a strong general option but less aligned with this application's precise locking requirements.

### C — TypeORM

The team had concerns about decorator/metadata machinery, typing, generated migration review effort, and maintenance. It offered no decisive advantage over Drizzle or Prisma under the selected criteria.

### D — Sequelize

The team considered its JavaScript-oriented API and TypeScript integration less suitable for the strict TypeScript codebase, and its abstraction less close to SQL. It was not selected.

### E — Kysely

Its typing, SQL-oriented queries, and locking support were attractive. The team wanted schema declaration and migration generation together, so a query builder with separately assembled schema/migration tooling only partially met C3.

### F — Keep handwritten `mysql2` queries

This would avoid migration effort but leave duplicated access code and the lack of managed migrations unresolved.

### Assessment summary

| Criterion | Drizzle | Prisma | TypeORM | Sequelize | Kysely | Existing code |
| --- | --- | --- | --- | --- | --- | --- |
| C1 Locks / transactions | Yes | Partial (raw SQL) | Partial | Partial | Yes | Yes (untyped) |
| C2 Typing | Yes | Yes | Partial | No | Yes | No |
| C3 Migrations | Yes | Yes | Partial | Partial | Partial | No |
| C4 Incremental adoption | Yes | Partial | Partial | Partial | Yes | — |
| C5 Build / image | Yes | Partial (generation step) | Yes | Yes | Yes | Yes |
| C6 SQL control | Yes | Partial | Partial | No | Yes | Yes |
| C7 Zod integration | Yes | Partial (additional tooling) | No | No | No | No |

“Yes” means the team considered the criterion satisfied; “Partial” means additional work or compromises; “No” means it did not satisfy the evaluated requirement.

## Decision

**Adopt Drizzle ORM with `drizzle-kit` migrations, targeting MySQL 8.4 as the sole database engine.**

C1 is decisive: event reliability depends on the transactional outbox. Of the evaluated options, Drizzle best combines typed locking operations, schema definitions, and migration generation for our needs.

The audit's argument for Prisma focused partly on switching between SQLite and MySQL through configuration. That benefit carries less weight once MySQL is the sole target.

## Consequences

### Expected benefits

- Consolidate data access and eventually remove the SQLite adapter, legacy MySQL adapter, and separate eventing pool.
- Review versioned SQL migrations in pull requests instead of relying on startup table creation.
- Keep task updates and outbox operations typed throughout.
- Eventually remove `sqlite3` and its native compilation toolchain from Docker builds, addressing the audit's image concerns.
- Allow model-derived validation where appropriate.

### Costs and risks

- Pin exact `drizzle-orm` and `drizzle-kit` versions and handle upgrades in dedicated PRs.
- Baseline the production schema carefully: generated initial migrations must not recreate or discard existing tables.
- Allow time for the team to learn Drizzle.
- Accept that supporting another engine would require schema changes.
- Update audit guidance and comments that still anticipate Prisma.

## Original implementation plan

Each step is intended as a separate production change, with rollback compatibility assessed before deployment.

0. **Safety net.** Add integration tests against real MySQL 8.4 in CI and verify backup restoration.
1. **Merge data.** If SQLite still contains data, stop writers, run `npm run db:merge-sqlite` as a dry run, then with `--apply`. Preserve conflicts for review and verify the transaction before commit. See the migration guide for import limits and duplicate handling.
2. **Baseline the schema.** Introspect a production copy, establish migration history, and verify that a subsequent generation produces no schema changes. The original proposal suggested marking a baseline as applied; the implemented approach below replaces that procedure.
3. **Introduce Drizzle persistence** behind `PERSISTENCE_DRIVER=legacy|drizzle`, defaulting to `legacy`. Change the setting and restart processes to select an adapter without changing application code.
4. **Migrate the outbox** transaction, enqueue, claim, publish-marking, and task-update operations. Monitor unpublished outbox events and RabbitMQ queues.
5. **Clean up after a stable period.** Remove legacy adapters, `sqlite3`, the switch, and handwritten startup table creation; simplify the Dockerfile.
6. **Strengthen the schema incrementally.** Introduce identity and constraints while preserving existing data and accounting for duplicates and NULL values.

Migrations run as a dedicated deployment step, never automatically in API startup. Review generated SQL in PRs and assess compatibility with the preceding application version.

## Implementation notes

The implemented baseline uses `CREATE TABLE IF NOT EXISTS` and is applied normally with `npm run db:migrate`; do not manually mark it as applied. This completes partially initialized databases without dropping existing tables. The [migration guide](../../drizzle/README.md) is the operational reference.

Legacy adapters, SQLite, and its build toolchain still exist; their removal remains a target rather than a completed outcome. Authentication and task HTTP routes already use Drizzle/MySQL regardless of `PERSISTENCE_DRIVER`.

Ownership introduces a new generated task key while retaining legacy IDs and nullable values. Once tasks become private, switching back to an anonymous API is unsafe. [ADR 0003](0003-claim-legacy-todos-after-authentication.md) records that decision and its rollback implications.

## Success criteria

- Handwritten SQL outside migrations is removed or its exceptions documented.
- MySQL integration tests pass in CI for every PR.
- Generating migrations without schema changes produces no new migration. This checks schema/history alignment; it does not prove a deployed database has no drift.
- The production image eventually no longer includes `sqlite3` or its compilation toolchain.
- Data preservation is verified at each step using field comparisons, counts, and import conflict reports as appropriate.

## Revisit this decision if

- An engine other than MySQL becomes necessary.
- Drizzle becomes unmaintained or repeated incompatible changes make it unsuitable.
- The outbox moves to a service that no longer uses this database.
