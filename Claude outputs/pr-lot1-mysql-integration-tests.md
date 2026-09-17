test(integration): add a MySQL 8.4 safety net before the Drizzle migration

## Goal

Adds an integration test suite that runs against a real MySQL 8.4 server and freezes the current behaviour of `/items`, the `Persistence` layer and the transactional outbox, and runs it as a blocking step in CI. This is step 0 of ADR 0001 (Drizzle ORM): every following lot must keep these tests green. No production code is changed.

Closes #

## Type of change

- [ ] `feat` — New feature
- [ ] `fix` — Bug fix
- [x] `ci` / `build` — pipeline, image, tooling
- [ ] `docs` — documentation
- [x] `refactor` / `perf` / `style` / `test` — No functional change

## What changes

**Tests — `spec/integration/` (73 tests, 4 files)**

| File | Tests | Covers |
|---|---|---|
| `items.spec.ts` | 38 | `GET/POST/PUT/DELETE /items`: status codes, exact JSON body, headers, unknown id (404 on PUT, 200 on DELETE), accents and emoji, 255/256-character names, duplicate ids, generic 500 without SQL leak |
| `outbox.spec.ts` | 22 | Task and event written in the same transaction, rollback, `FOR UPDATE SKIP LOCKED` with 2 to 4 concurrent relays, at-least-once delivery, relay with an in-memory publisher, worker idempotency |
| `persistence.spec.ts` | 11 | The 7 methods of `Persistence` on MySQL, including `completed` returned as a boolean when stored as `NULL` |
| `schema.spec.ts` | 2 | Tables created at startup match the production `SHOW CREATE TABLE`; a restart does not touch data |

- 19 tests are titled **"current behaviour, to be fixed"**: they pin a behaviour that exists today but is wrong (unvalidated input, whole-table lock, writes blocked while the relay waits for RabbitMQ…). They document it and will be updated by the related issues, not by the Drizzle lots.
- Safety guard (`support/guard.ts`, `support/database.ts`): the suite refuses to run unless the database name ends with `_test`, checked on the variable **and** on the server's answer, and refuses `MYSQL_*_FILE` variables. Tests delete rows, so they can never reach a real database.

**Configuration**

- `jest.integration.config.cjs`: runs files one at a time, `TZ=Europe/Paris` to catch dates written in local time, coverage in `coverage/integration`.
- `jest.config.cjs` + `spec/support/unit-env.ts`: `npm test` stays unit-only and ignores `MYSQL_*` variables, so exporting them no longer breaks `updateItem.spec.ts`.
- `package.json`: new `npm run test:integration` script; `supertest` 7.2.2 and `@types/supertest` 7.2.1 as exact dev dependencies. The script uses `--experimental-vm-modules` because `uuid` v13 is ESM-only and Jest can only load it that way.
- `.github/workflows/ci.yml`: `mysql:8.4` service in the `Tests` job and a blocking integration step. `MYSQL_*` variables are only set on that step. The passwords are throwaway values for a job-scoped container (a random root password would be printed in the public job log). Workflow permissions are unchanged.
- `.dockerignore`: excludes the new Jest configuration from the image.

**Findings reported as separate issues** (not fixed here): `MYSQL_*_FILE` ignored by the event-driven pool, invalid events retried 5 times before the DLQ, `FOR UPDATE` locking the whole `todo_items` table, API writes blocked while the relay waits for RabbitMQ, unvalidated input, `todo` account with all privileges, remote `root@%`, port 3306 published on all interfaces.

## Definition of Done

Cocher chaque point, ou le barrer en expliquant pourquoi il est sans objet.

- [ ] 1. Revue par au moins une approbation
- [x] 2. Tests unitaires sur la logique métier introduite — no business logic introduced; 73 integration tests added, 21 unit tests still green
- [x] 3. Niveau de couverture requis atteint — 98 % of lines on the integration run; MySQL adapters, outbox, relay and `updateTask` at 100 %
- [ ] 4. Quality gate passé
- [ ] 5. Pipeline CI complète au vert — first real run happens on this PR
- [ ] ~~6. Artefacts de build / image Docker produits~~ — N/A: the image content is unchanged (`spec/` and Jest configs are excluded by `.dockerignore`); `docker compose build` checked locally
- [x] 7. Documentation à jour — usage documented in `jest.integration.config.cjs` and in the CI workflow comments
- [x] 8. Démontrable en Sprint Review

## How to verify

Everything runs in Docker with Node 24, on a throwaway MySQL that publishes no port, so it cannot touch the `legacy-kanban` stack. **Never run `docker compose` without `-p lk-test`.**

```powershell
docker build --target deps -t lk-test-deps .
docker network create lk-test-net
docker run -d --name lk-test-mysql --network lk-test-net -e MYSQL_ROOT_PASSWORD=local-only -e MYSQL_DATABASE=todos_test -e MYSQL_USER=todo_test -e MYSQL_PASSWORD=local-only --health-cmd "mysqladmin ping -h 127.0.0.1 --silent" --health-interval 2s --health-retries 60 mysql:8.4
# wait until this prints "healthy"
docker inspect -f "{{.State.Health.Status}}" lk-test-mysql
```

Then:

1. **Unit tests**: `npm test` → `Tests: 21 passed`
   ```powershell
   docker run --rm --mount "type=bind,source=${PWD},target=//app" --mount "type=volume,target=//app/node_modules" -w //app lk-test-deps npm test -- --coverage=false
   ```
2. **Integration tests** → `Test Suites: 4 passed`, `Tests: 73 passed`
   ```powershell
   docker run --rm --network lk-test-net --mount "type=bind,source=${PWD},target=//app" --mount "type=volume,target=//app/node_modules" -w //app -e MYSQL_HOST=lk-test-mysql -e MYSQL_USER=todo_test -e MYSQL_PASSWORD=local-only -e MYSQL_DB=todos_test lk-test-deps npm run test:integration -- --coverage=false
   ```
3. **Guard**: same command with `-e MYSQL_DB=todos` → fails immediately with `Refusing to run against database "todos"`, no test runs.
4. **Audit**: `npm audit --audit-level=high` in the same image → `found 0 vulnerabilities`.
5. **Cleanup**:
   ```powershell
   docker rm -f lk-test-mysql; docker network rm lk-test-net; docker image rm lk-test-deps
   ```

The whole procedure (plus an end-to-end run of the full stack) is also available as a single script: `powershell -ExecutionPolicy Bypass -File ..\test-lot1.ps1`.
