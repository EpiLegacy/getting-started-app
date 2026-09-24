# Getting started

For local development, run `npm install` and `npm run dev`.
Authentication and task ownership require MySQL with migrations applied. Supply
`MYSQL_HOST`, `MYSQL_USER`, `MYSQL_PASSWORD`, and `MYSQL_DB` to the API and
`npm run db:migrate`. `docker compose up --build` provides MySQL, migrations,
the API, and the event broker. SQLite-only startup still serves the app and health
check, but authenticated endpoints return 503; existing SQLite data remains intact.
See [the ownership migration guide](drizzle/README.md#task-ownership-0002_task_ownershipsql)
for preserving and importing old data before enabling accounts.
SQLite stores tasks in `data/todo.db` relative to the working directory.
To use another writable location, run
`SQLITE_DB_LOCATION=/path/to/todo.db npm run dev`.
Both the database file and its parent directory must be writable.
Existing databases at `/etc/todos/todo.db` are not moved automatically.

The React frontend lives in `src/client`:

```text
src/client/
  main.tsx                 # Browser entry point and router provider
  app/                     # App providers, route definitions, layout, theme
  pages/                   # Route-level screens
  features/auth/           # Session state, auth API, route protection
  features/todos/          # Todo components, API calls, and styles
  lib/                     # Shared browser utilities (HTTP client)
  index.html               # Vite HTML entry
```

Add screens in `pages/` and register them in `app/routes.tsx`. Keep feature-specific
components and data access in `features/<feature>/`; use React Router links for
internal navigation. `/` is the dashboard, `/todos` is the todo list, and unmatched
paths show a not-found screen. `/login` and `/register` are public; the dashboard
and task list require a session. `/profile` shows your email, account ID, and
creation date without editing controls. From this page, confirm your current
password to permanently delete your account and all owned tasks (including
claimed tasks). All sessions are revoked, and shared unassigned tasks and other
users’ tasks remain unchanged. The task list separates your tasks from existing
unassigned tasks. Any signed-in account can claim an unassigned task; after a
successful claim it is private to that account. Simultaneous claims have one
winner, and the other user sees a conflict message and refreshed list.
Vite handles direct links during development;
Express serves the built app for frontend routes in production, preserving API
responses and asset 404s. The build output remains `dist/`. Backend code stays outside
`src/client`, and `src/types.ts` contains the shared item contract.

Integration tests require MySQL 8.4 and a dedicated database. Start the local
server with `docker compose up -d mysql`, then grant the development user access
to the test database (once per MySQL volume):

```sh
docker compose exec mysql sh -lc 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" -e "GRANT ALL PRIVILEGES ON todos_test.* TO '\''$MYSQL_USER'\''@'\''%'\'';"'
npm run test:integration
```

The test command reads connection settings from `.env` and defaults to
`MYSQL_HOST=127.0.0.1` and `MYSQL_DB=todos_test`. It ignores `.env`'s
`MYSQL_DB` so the application database is never selected implicitly.
Optional `.env.integration` settings override `.env`; exported shell or CI
variables take precedence over both files. To select another test database,
set `MYSQL_DB` in `.env.integration` or the shell. Its name must end with
`_test`: these tests delete rows and recreate tables. The runner creates the
database if missing, resets its tables before each suite,
and applies every migration in `drizzle/meta/_journal.json`. It also restores a
fresh migrated schema after the run. `MYSQL_USER` needs privileges to create
and manage this dedicated database; all data in it is disposable.

If your shell exports the application's `MYSQL_DB` (for example `todos`), the
safety guard intentionally refuses to run. Override it for the test command:

```sh
MYSQL_DB=todos_test npm run test:integration
```

This repository is a sample application for users following the getting started guide at https://docs.docker.com/get-started/.

The application is based on the application from the getting started tutorial at https://github.com/docker/getting-started
