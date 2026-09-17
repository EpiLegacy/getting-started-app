# Getting started

For local development, run `npm install` and `npm run dev`.
SQLite stores tasks in `data/todo.db` relative to the working directory.
To use another writable location, run
`SQLITE_DB_LOCATION=/path/to/todo.db npm run dev`.
Both the database file and its parent directory must be writable.
Existing databases at `/etc/todos/todo.db` are not moved automatically.

This repository is a sample application for users following the getting started guide at https://docs.docker.com/get-started/.

The application is based on the application from the getting started tutorial at https://github.com/docker/getting-started
