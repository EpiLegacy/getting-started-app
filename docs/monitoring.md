# API monitoring with Prometheus

The API exposes `/metrics`. Prometheus scrapes it every 15 seconds and retains
15 days of history in the `prometheus-data` Docker volume. This first setup covers
API requests and the API's Node.js process. Worker, RabbitMQ and MySQL metrics,
Grafana dashboards and alert notifications are not configured yet.

## Start and inspect

From the repository root, with your existing `.env`:

```sh
docker compose up --build -d
docker compose ps
curl http://localhost:3000/metrics
```

If the rest of the stack is already running and migrated, update only the API
and start monitoring without recreating the database or broker:

```sh
docker compose up --build -d --no-deps api
docker compose up -d --no-deps prometheus
```

Open <http://localhost:9090/targets> and check that `kanban-api` becomes **UP**.
It may take 15 seconds. UP means the metrics endpoint was scraped successfully;
it does not guarantee that the database or every app feature works.

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
  process, not the entire machine or other services.

## Troubleshooting and access

```sh
docker compose logs --tail=100 prometheus api
docker compose exec prometheus promtool check config /etc/prometheus/prometheus.yml
```

If the target is DOWN, inspect its error on the Targets page and confirm the API
was rebuilt. The target `api:3000` uses Docker's internal network; changing the
host's `API_PORT` does not change this target. This configuration expects the API
to run in Compose; it does not scrape an API started separately with `npm run dev`.

After editing `monitoring/prometheus.yml`, run `docker compose restart prometheus`.
Stop monitoring with `docker compose stop prometheus`; its history persists.
`docker compose down -v` deletes all stack volumes, including application data.

The API's `/metrics` endpoint is unauthenticated so Prometheus can scrape it.
Before exposing this app publicly, restrict `/metrics` at your reverse proxy or
move it to a private listener. Do not publish the Prometheus UI publicly.

References: [Prometheus documentation](https://prometheus.io/docs/introduction/overview/)
and [Node.js client](https://github.com/prometheus/client_js).
