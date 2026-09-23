# Getting started

For local development, run `npm install` and `npm run dev`.
SQLite stores tasks in `data/todo.db` relative to the working directory.
To use another writable location, run
`SQLITE_DB_LOCATION=/path/to/todo.db npm run dev`.
Both the database file and its parent directory must be writable.
Existing databases at `/etc/todos/todo.db` are not moved automatically.

Integration tests require MySQL 8.4 and a dedicated database. Start the local
server with `docker compose up -d mysql`, then create the test database and
grant the development user access (once per MySQL volume):

```sh
docker compose exec mysql sh -lc 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" -e "CREATE DATABASE IF NOT EXISTS todos_test CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci; GRANT ALL PRIVILEGES ON todos_test.* TO '\''$MYSQL_USER'\''@'\''%'\'';"'
npm run test:integration
```

The test command reads connection settings from `.env` and defaults to
`MYSQL_HOST=127.0.0.1` and `MYSQL_DB=todos_test`. It ignores `.env`'s
`MYSQL_DB` so the application database is never selected implicitly.
Optional `.env.integration` settings override `.env`; exported shell or CI
variables take precedence over both files. To select another test database,
set `MYSQL_DB` in `.env.integration` or the shell. Its name must end with
`_test`: these tests delete rows and recreate tables. The database must
already exist and be accessible to `MYSQL_USER`.

This repository is a sample application for users following the getting started guide at https://docs.docker.com/get-started/.

The application is based on the application from the getting started tutorial at https://github.com/docker/getting-started
