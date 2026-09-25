#!/bin/sh
# Runs automatically for a new MySQL volume. For an existing volume, run:
# docker compose exec mysql sh /docker-entrypoint-initdb.d/10-monitoring.sh
(
    set -eu
    : "${MYSQL_ROOT_PASSWORD:?MYSQL_ROOT_PASSWORD must be set}"
    : "${MYSQL_EXPORTER_PASSWORD:?MYSQL_EXPORTER_PASSWORD must be set}"

    # Treat the password as a SQL string, including quotes and backslashes.
    monitoring_password_sql=$(printf '%s' "$MYSQL_EXPORTER_PASSWORD" | sed "s/'/''/g")
    MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql --protocol=socket --user=root <<SQL
SET SESSION sql_mode = 'NO_BACKSLASH_ESCAPES';
CREATE USER IF NOT EXISTS 'prometheus'@'%' IDENTIFIED BY '$monitoring_password_sql' WITH MAX_USER_CONNECTIONS 3;
ALTER USER 'prometheus'@'%' IDENTIFIED BY '$monitoring_password_sql' WITH MAX_USER_CONNECTIONS 3;
SQL
    # SHOW GLOBAL STATUS / VARIABLES need only a login, not application-table
    # SELECT privileges. The exporter disables collectors needing extra grants.
    echo 'MySQL monitoring account configured.'
)
