-- Read-only inspection of the database, for the Drizzle migration (ADR 0001).
-- No data content is selected: only schema, settings and counts.

SELECT VERSION() AS version,
       @@GLOBAL.sql_mode AS global_sql_mode,
       @@SESSION.sql_mode AS session_sql_mode,
       @@character_set_database AS charset,
       @@collation_database AS collation,
       @@transaction_isolation AS isolation;

SHOW TABLES;

SHOW CREATE TABLE todo_items\G
SHOW CREATE TABLE outbox_events\G
SHOW CREATE TABLE notifications\G
SHOW CREATE TABLE processed_events\G
SHOW CREATE TABLE todo_items_merge_conflicts\G

SELECT COUNT(*) AS total,
       SUM(id IS NULL OR id = '') AS empty_ids,
       SUM(name IS NULL) AS null_names,
       SUM(completed IS NULL) AS null_completed,
       MAX(CHAR_LENGTH(name)) AS longest_name
FROM todo_items;

SELECT COUNT(*) AS duplicated_ids
FROM (SELECT id FROM todo_items GROUP BY id HAVING COUNT(*) > 1) AS d;

SELECT user, host FROM mysql.user WHERE user NOT LIKE 'mysql.%';
SHOW GRANTS FOR CURRENT_USER();
