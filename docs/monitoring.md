# Application monitoring with Prometheus and Grafana

Prometheus scrapes the API, notification worker, RabbitMQ and MySQL exporter
every 15 seconds and retains 15 days of history in the `prometheus-data` Docker
volume. Grafana displays these metrics in a provisioned dashboard. Alert
notifications are not configured yet.

## Grafana dashboard

With the existing monitoring stack running, start Grafana:

```sh
docker compose up -d --no-deps --wait grafana
```

Open <http://localhost:3001/d/kanban-overview> and sign in:

- Username: `admin`
- Password: `grafana_dev_password`

These are local defaults. You can set `GRAFANA_ADMIN_USER`,
`GRAFANA_ADMIN_PASSWORD` and `GRAFANA_PORT` in `.env` before the first start.
Grafana initializes the login only when its data volume is first created;
changing those environment values later does not reset an existing password.
Use Grafana's profile settings to change your password once signed in.

The **Kanban · Application overview** dashboard and **Prometheus** data source
are installed automatically. The dashboard is also the default home page.
It refreshes every 15 seconds and initially shows the last hour. Use the time
picker in the upper right to change the period, or drag across a chart to zoom.
Hover over a chart for individual values and over its information icon for an
explanation of what the panel measures.

The dashboard contains:

- Service health: API reachability, worker consumer registration, RabbitMQ,
  MySQL connectivity, queue metrics and the expected five scrape targets.
- API: requests by route/status, server errors and p95 response times.
- Worker: attempts by outcome, p95 processing time, in-flight messages and
  counters since the process restarted.
- RabbitMQ: waiting and unacknowledged messages, including the dead-letter
  queue, and consumers per queue.
- MySQL: connections versus the limit, query and slow-query rates, and InnoDB
  row operations.
- Resources: API and worker process memory and CPU usage.

Use the app and complete an unfinished task to generate activity. Allow at
least two scrapes for rate charts. A latency chart can show **No data** when no
requests or messages occurred; that is not the same as a service outage. A
missing or failed health metric displays **Unavailable**, not a healthy zero.
Threshold colors are dashboard indicators only; they do not send alerts.

Grafana connects to `http://prometheus:9090` inside Docker. It does not connect
directly to MySQL or need your application's credentials. Its UI binds only to
localhost, and its settings persist in the `grafana-data` volume.

The shared dashboard is managed in
[`monitoring/grafana/dashboards/kanban-overview.json`](../monitoring/grafana/dashboards/kanban-overview.json).
Edit that file to update it for everyone; Grafana polls for changes every 30
seconds. To experiment in the UI, save a copy with a different name and UID.
Edits to provisioning YAML require `docker compose restart grafana`.

If Grafana is unavailable, run `docker compose ps grafana` and
`docker compose logs --tail=100 grafana`. If it opens but charts are empty,
check the Prometheus Targets page and the selected time range. Grafana can only
show history retained by Prometheus (15 days by default).

| Target/job | Internal endpoint | What it measures |
| --- | --- | --- |
| `kanban-api` | `api:3000/metrics` | API requests, errors, latency and Node.js process |
| `kanban-worker` | `worker:9000/metrics` | Processing outcomes, duration, in-flight work, consumer state and Node.js process |
| `rabbitmq` | `rabbitmq:15692/metrics` | Broker-wide connections, channels, memory and message statistics |
| `rabbitmq-queues` | `rabbitmq:15692/metrics/detailed` | Messages and consumers per queue, including the dead-letter queue |
| `mysql` | `mysql-exporter:9104/metrics` | MySQL availability, connections, query activity and InnoDB status |

## Start and inspect

For a fresh database volume, from the repository root with your `.env`:

```sh
docker compose up --build -d
docker compose ps
curl http://localhost:3000/metrics
```

For an existing, migrated stack, provision the monitoring user once. MySQL's
initialization scripts do not run automatically on an existing data volume.
Optionally add `MYSQL_EXPORTER_PASSWORD` to `.env`; the local default is
`monitoring_dev_password`. These commands briefly restart MySQL to mount the
setup script and pass its password, and enable RabbitMQ's plugin in place:

```sh
docker compose up -d --no-deps --wait mysql
docker compose exec mysql sh /docker-entrypoint-initdb.d/10-monitoring.sh
docker compose exec rabbitmq rabbitmq-plugins enable rabbitmq_prometheus
docker compose up --build -d --no-deps worker mysql-exporter
docker compose up -d --no-deps prometheus
docker compose restart prometheus
```

The committed RabbitMQ plugin list enables both management and Prometheus when
the broker is next created. No host ports are published for the worker, MySQL
exporter or RabbitMQ metrics.

Open <http://localhost:9090/targets> and check that all five jobs become **UP**.
It may take 15 seconds. UP means an endpoint was scraped successfully. For actual
dependency status, also check `mysql_up{job="mysql"}` and
`notification_worker_consuming{job="kanban-worker"}`; both should be 1.

Open the app at <http://localhost:3000>, sign in, list tasks and create/update a
task. Open <http://localhost:9090/query>, enter a query below, and select Execute.
Use the graph view to see changes over time. Rate queries need at least two
scrapes; allow about 30 seconds while generating traffic.

The UI binds to localhost only. Set `PROMETHEUS_PORT=9091` in `.env` if port 9090
is already occupied. Substitute your `API_PORT` when it differs from 3000.

## Useful queries

Scrape success (1 = successful, 0 = failed):

```promql
up{job="kanban-api"}
```

Request counts since the API process started, by method, route and status:

```promql
http_requests_total{job="kanban-api"}
```

Requests per second, averaged over five minutes:

```promql
sum(rate(http_requests_total{job="kanban-api"}[5m]))
```

Server errors per second (empty until a 5xx response has occurred):

```promql
sum(rate(http_requests_total{job="kanban-api",status=~"5.."}[5m]))
```

Estimated response time in seconds below which 95% of requests fall, by route:

```promql
histogram_quantile(0.95, sum by (le, route) (rate(http_request_duration_seconds_bucket{job="kanban-api"}[5m])))
```

API process memory in MiB:

```promql
process_resident_memory_bytes{job="kanban-api"} / 1024 / 1024
```

CPU usage in CPU cores (1 = one core fully busy):

```promql
rate(process_cpu_seconds_total{job="kanban-api"}[5m])
```

## What is counted

- Completed `/auth` and `/items` responses, including errors. `/health`,
  `/metrics` and frontend assets do not inflate request measurements.
- Labels are `method`, `route` and `status`. Task routes use `/items/:id`, never
  actual IDs. Responses before route matching (such as rejected authentication
  or malformed JSON) use `/auth/*` or `/items/*`.
- Counters reset on API restart; Prometheus retains history and `rate()` handles
  counter resets. Missing request series mean no matching requests have yet
  completed. Latency queries can show NaN when there is no traffic.
- CPU, memory, garbage collection and event loop metrics describe the API
  process when filtered with `job="kanban-api"`. Use `job="kanban-worker"`
  for the worker. They do not measure the whole host machine.

## RabbitMQ and notification worker

Mark an unfinished task as completed in the app to exercise the notification
path. The outbox relay publishes its event and the worker processes it. Merely
listing tasks does not produce notification events.

Messages waiting for the worker:

```promql
rabbitmq_detailed_queue_messages_ready{job="rabbitmq-queues",queue="notifications.task-events"}
```

Delivered messages waiting for acknowledgement:

```promql
rabbitmq_detailed_queue_messages_unacked{job="rabbitmq-queues",queue="notifications.task-events"}
```

Active consumers (normally 1 for the current single-worker setup):

```promql
rabbitmq_detailed_queue_consumers{job="rabbitmq-queues",queue="notifications.task-events"}
```

Messages in the dead-letter queue (investigate values above zero):

```promql
rabbitmq_detailed_queue_messages_ready{job="rabbitmq-queues",queue="notifications.task-events.dlq"}
```

Worker processing attempts, grouped by outcome:

```promql
notification_worker_messages_total{job="kanban-worker"}
```

Outcomes are `applied` (notification written), `duplicate` (already processed),
`ignored` (event not handled), `rejected` (invalid JSON/envelope, dead-lettered),
and `failed` (processing/acknowledgement failed, normally requeued). Retries count
as separate attempts; these are not counts of unique business events. An invalid
task payload inside an otherwise valid envelope follows the existing retry path.
Messages dead-lettered by the broker after exhausting retries are visible in the
DLQ backlog, not necessarily in the worker's `rejected` counter.

Failed attempts per second:

```promql
sum(rate(notification_worker_messages_total{job="kanban-worker",outcome="failed"}[5m]))
```

95th percentile processing duration, in seconds:

```promql
histogram_quantile(0.95, sum by (le) (rate(notification_worker_processing_duration_seconds_bucket{job="kanban-worker"}[5m])))
```

`notification_worker_in_flight` reports concurrent processing attempts.
`notification_worker_consuming` is 0 during startup, broker disconnection or
consumer cancellation, and 1 after a consumer is registered. The worker's Docker
healthcheck uses this state. A live metrics endpoint alone does not prove that
the consumer is working, and registered consumers can still have database errors.

## MySQL

The `prometheus` MySQL account has a maximum of three connections and no grants
to application tables. Only the global status and global variables collectors
are enabled; these need permission to connect, not application-data access.
The setup script can be rerun to synchronize `MYSQL_EXPORTER_PASSWORD` without
changing application tables. After changing the password in `.env`, recreate
the MySQL service to update its environment, rerun the script, and recreate
`mysql-exporter` with `docker compose up -d --no-deps mysql-exporter`.

Database connection success (1 = exporter connected):

```promql
mysql_up{job="mysql"}
```

Connected clients and configured connection limit:

```promql
mysql_global_status_threads_connected{job="mysql"}
mysql_global_variables_max_connections{job="mysql"}
```

Run each expression separately. Query activity and slow-query rates:

```promql
rate(mysql_global_status_queries{job="mysql"}[5m])
rate(mysql_global_status_slow_queries{job="mysql"}[5m])
```

These statistics cover the MySQL server, including monitoring traffic. Slow
queries follow the server's configured time threshold; this setup does not
capture SQL text or attribute individual queries to API routes. Check the
`mysql-exporter` logs if a collector fails or expected metrics are missing.

## Troubleshooting and access

```sh
docker compose logs --tail=100 grafana prometheus api worker mysql-exporter
docker compose exec prometheus promtool check config /etc/prometheus/prometheus.yml
```

If the target is DOWN, inspect its error on the Targets page and confirm the API
was rebuilt. The target `api:3000` uses Docker's internal network; changing the
host's `API_PORT` does not change this target. This configuration expects the API
to run in Compose; it does not scrape an API started separately with `npm run dev`.

If the MySQL target is UP but `mysql_up` is 0, run the monitoring-user setup
command above and check the exporter logs for authentication errors. MySQL root
credentials must match those used when the existing volume was initialized.
If RabbitMQ targets are DOWN, check `docker compose exec rabbitmq
rabbitmq-plugins list -e` for `rabbitmq_prometheus`. If a queue series is absent,
confirm the API/worker has successfully declared that queue; absence is not zero.

After editing `monitoring/prometheus.yml`, run `docker compose restart prometheus`.
Stop monitoring with `docker compose stop prometheus`; its history persists.
`docker compose down -v` deletes all stack volumes, including application data.

The API's `/metrics` endpoint is unauthenticated so Prometheus can scrape it.
Before exposing this app publicly, restrict `/metrics` at your reverse proxy or
move it to a private listener. Do not publish the Prometheus UI publicly.

References: [Prometheus documentation](https://prometheus.io/docs/introduction/overview/)
and [Node.js client](https://github.com/prometheus/client_js),
[RabbitMQ monitoring](https://www.rabbitmq.com/docs/prometheus),
[MySQL exporter](https://github.com/prometheus/mysqld_exporter),
[MySQL status privileges](https://dev.mysql.com/doc/refman/8.4/en/show-status.html),
[Grafana provisioning](https://grafana.com/docs/grafana/latest/administration/provisioning/).
