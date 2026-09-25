# Legacy Kanban

A task application with a React/Vite frontend, an Express/TypeScript API,
MySQL persistence managed by Drizzle, and RabbitMQ-backed notifications.
Accounts and task ownership require MySQL with migrations applied.

- [Set up the app](#set-up-the-app)
- [Migrate legacy SQLite data to MySQL](drizzle/README.md#move-from-legacy-sqlite-to-mysql)
- [Contribute](#contribute)
- [Backend API reference](docs/api.md)
- [Grafana dashboard and monitoring](docs/monitoring.md)
- [Database migrations](drizzle/README.md)

## Set up the app

Run commands from the repository root. If you have existing data, follow the
[SQLite migration guide](drizzle/README.md#move-from-legacy-sqlite-to-mysql)
before starting the full stack.

### Docker Compose

Install Docker with Compose v2, then:

```sh
cp .env.example .env # First setup only; preserve an existing .env.
docker compose up --build -d
```

Compose starts MySQL 8.4, RabbitMQ, a one-shot migration service, the API serving
the built frontend, the notification worker, Prometheus, Grafana, and a MySQL exporter.
The API and worker wait for migrations to succeed. Existing database volumes
need the one-time [monitoring-account setup](docs/monitoring.md#start-and-inspect).

Open <http://localhost:3000> and register an account. RabbitMQ management is at
<http://localhost:15672> (local defaults: `guest` / `guest`). Check startup with:

```sh
docker compose ps -a
docker compose logs migration api worker
curl http://localhost:3000/health
```

The Grafana dashboard is at <http://localhost:3001/d/kanban-overview>
(local login: `admin` / `grafana_dev_password`). It is provisioned automatically;
see the [monitoring guide](docs/monitoring.md#grafana-dashboard) for usage and setup.

Use `docker compose down` to stop the stack; named volumes retain database and
broker data. Adding `-v` deletes those volumes and their data.

### Local development

Use Node.js 24 (see [.nvmrc](.nvmrc)) and npm. The native `sqlite3` dependency may
need Python 3, make, and a C++ compiler if a prebuilt binary is unavailable.

```sh
npm ci
cp .env.example .env # Skip if it already exists.
docker compose up -d --wait mysql rabbitmq

# Export your trusted local configuration into this shell (Bash).
set -a
. ./.env
set +a
export MYSQL_HOST=127.0.0.1
export RABBITMQ_URL="amqp://${RABBITMQ_USER}:${RABBITMQ_PASSWORD}@127.0.0.1:${RABBITMQ_PORT}"

npm run db:migrate
npm run dev
```

The shell-loading example expects shell-compatible `.env` values; quote values
containing shell metacharacters. Compose reads `.env` automatically, but the API,
worker, migration configuration, and SQLite importer do not load it themselves.
Keep the exports in each shell that runs these commands.

Open <http://localhost:5173>. Vite proxies `/auth` and `/items` to the API on
port 3000. Query `/health` directly at <http://localhost:3000/health>.
Stop the Compose API first if it already occupies port 3000:
`docker compose stop api worker`.

To process notifications locally, run this in another shell with the same
connection variables exported:

```sh
npx tsx src/workers/notifications/index.ts
```

`npm run build` bundles only the frontend into `dist/`. To build both halves
as CI does, run `npx tsc -p tsconfig.build.json` and `npm run build`; start the
compiled API with `node build/index.js`. `npm start` runs the TypeScript API
and serves an existing `dist/` build. Neither command applies migrations.

### Configuration

Use [.env.example](.env.example) for local defaults; do not commit secrets or
reuse development credentials in an exposed deployment.

| Variable | Purpose |
| --- | --- |
| `MYSQL_HOST` | MySQL hostname; use `127.0.0.1` for local npm commands. Compose sets `mysql` internally. |
| `MYSQL_PORT` | MySQL connection port, default `3306`; also the host port published by Compose. |
| `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DB` | Application database credentials and database name. |
| `MYSQL_ROOT_PASSWORD` | Initializes the Compose MySQL root account. |
| `MYSQL_EXPORTER_PASSWORD` | Password for the dedicated monitoring account; local default `monitoring_dev_password`. Existing database volumes need the [monitoring setup command](docs/monitoring.md#start-and-inspect). |
| `RABBITMQ_URL` | API/worker broker URL; defaults to `amqp://guest:guest@localhost:5672`. |
| `RABBITMQ_USER`, `RABBITMQ_PASSWORD` | Compose broker credentials. |
| `API_PORT`, `RABBITMQ_PORT`, `RABBITMQ_UI_PORT` | Compose host ports, default `3000`, `5672`, and `15672`. The local API always listens on `3000`. |
| `PROMETHEUS_PORT` | Localhost-only Prometheus UI port, default `9090`. See [monitoring](docs/monitoring.md). |
| `GRAFANA_PORT` | Localhost-only Grafana UI port, default `3001`. |
| `GRAFANA_ADMIN_USER`, `GRAFANA_ADMIN_PASSWORD` | Initial Grafana login, defaults `admin` / `grafana_dev_password`. Only initializes a new Grafana data volume. |
| `PERSISTENCE_DRIVER` | `legacy` (default) or `drizzle` for persistence/eventing adapters. Auth and task HTTP routes always use Drizzle/MySQL. |
| `SESSION_COOKIE_SECURE` | Production cookies require HTTPS unless set to `false`. Compose defaults to `false` for local HTTP. |
| `SQLITE_DB_LOCATION` | SQLite fallback path, default `data/todo.db` relative to the working directory. |

Without `MYSQL_HOST`, the app can start using SQLite and serve the frontend and
health check, but `/auth` and `/items` return `503`. This is not a full task-app
setup. SQLite's file and parent directory must be writable. Old databases at
`/etc/todos/todo.db` are not moved automatically.

## Contribute

Contact **micka.daoud@epitech.eu on Microsoft Teams** to request access to the
project's private resources. Then set up the app using the instructions above.

1. Create a branch for your change and keep its scope focused.
2. Follow the existing module structure. Add or update tests for changed behavior
   and update documentation when setup, endpoints, or workflows change.
3. For schema changes, edit `src/infrastructure/db/schema.ts`, run
   `npm run db:generate`, review the generated SQL and journal, and apply it to
   your development database with `npm run db:migrate`. See the
   [migration guide](drizzle/README.md).
4. Run the relevant checks below before opening a pull request.
5. Write commits and the PR in English. Use Conventional Commits for both commit
   messages and the PR title, for example `fix(tasks): validate task deadlines`.
   CI checks both. Fill in the [PR template](.github/pull_request_template.md),
   including verification steps and its Definition of Done; obtain at least one
   approval and passing CI checks.

### Checks

```sh
npm run typecheck
npm run lint
npm test
npm run db:check
npx tsc -p tsconfig.build.json
npm run build
```

Integration tests require MySQL 8.4 and a **disposable database whose name ends
in `_test`**. Start MySQL and grant the development user access once per volume:

```sh
docker compose up -d --wait mysql
docker compose exec mysql sh -lc 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" -e "GRANT ALL PRIVILEGES ON todos_test.* TO '\''$MYSQL_USER'\''@'\''%'\'';"'
MYSQL_DB=todos_test npm run test:integration
```

The runner reads `.env`, then optional `.env.integration`; exported shell/CI
variables take precedence. It defaults to host `127.0.0.1` and database
`todos_test`, ignoring `.env`'s `MYSQL_DB`. Select a different test database in
`.env.integration` or the shell. An exported application database name causes
the safety guard to refuse the run, hence the explicit override above.

The runner creates the test database if needed, resets tables before each
suite, applies journaled migrations, and restores a fresh migrated schema at
the end. All data in that database is disposable, and the test user needs
permission to create and manage it. Coverage reports are written to `coverage/`
and `coverage/integration/`.

### Project layout

| Location | Contents |
| --- | --- |
| `src/client/app`, `src/client/pages` | Frontend providers, layout, routes, and screens. |
| `src/client/features` | Auth and todo components, state, and API calls. |
| `src/modules/auth`, `src/modules/tasks` | Active backend routes, services, and repositories. |
| `src/infrastructure` | MySQL/Drizzle, RabbitMQ, and outbox infrastructure. |
| `src/persistence` | Legacy and Drizzle persistence adapters. |
| `src/workers/notifications` | Notification event consumer. |
| `src/types.ts` | Shared item contract. |
| `drizzle` | SQL migrations and migration metadata. |
| `spec` | Unit and integration tests. |

Add screens in `src/client/pages` and register them in `src/client/app/routes.tsx`.
Keep feature-specific code in `src/client/features/<feature>` and use React Router
links for internal navigation. `/login` and `/register` are public; `/`, `/todos`,
and `/profile` require a session. Users can claim shared unassigned tasks, after
which those tasks are private. Profile deletion requires the current password
and permanently removes the account, its sessions, and all owned tasks.

Architecture decisions are recorded in:

- [ADR 0001: Drizzle ORM](docs/adr/0001-adopter-drizzle-orm.md)
- [ADR 0002: Material UI](docs/adr/0002-adopt-material-ui.md)
- [ADR 0003: Claiming legacy todos after authentication](docs/adr/0003-claim-legacy-todos-after-authentication.md)

For release conventions, see the [release guide](docs/release.md).

This project originated from the [Docker getting-started application](https://github.com/docker/getting-started).
