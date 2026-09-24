# Backend API quick reference

[Back to README](../README.md)

The API is at `http://localhost:3000` by default, with no `/api` prefix.
Send JSON request bodies with `Content-Type: application/json`. Registration
and login set a seven-day `sid` session cookie (`HttpOnly`, `SameSite=Lax`);
retain it for authenticated requests. Production cookies are `Secure` unless
explicitly disabled. The frontend uses same-origin requests through Vite or
Express. Auth and task responses use `Cache-Control: no-store`.

## Endpoints

| Method and path | Session required | Request body | Success |
| --- | --- | --- | --- |
| `GET /health` | No | — | `200 {"status":"ok"}`; liveness only, no database probe. |
| `POST /auth/register` | No | `{ "email": "…", "password": "…" }` | `201 { "user": { "id": "…", "email": "…" } }`; sets cookie. |
| `POST /auth/login` | No | `{ "email": "…", "password": "…" }` | `200 { "user": { "id": "…", "email": "…" } }`; sets cookie. |
| `POST /auth/logout` | No | — | `204`; revokes the supplied session and clears cookie, even if already signed out. |
| `GET /auth/me` | Yes | — | `200 { "user": { "id": "…", "email": "…" } }`. |
| `GET /auth/profile` | Yes | — | `200 { "user": { "id": "…", "email": "…", "createdAt": "…" } }`; ISO timestamp. |
| `DELETE /auth/me` | Yes | `{ "password": "current password" }` | `204`; deletes account and all owned tasks, revokes every session, clears cookie. |
| `GET /items` | Yes | — | `200` array of your tasks. |
| `GET /items/unassigned` | Yes | — | `200` array of shared tasks with no owner. |
| `POST /items` | Yes | `name`, `deadline`, `priorisation` | `201` created task; always starts with `completed: false`. |
| `POST /items/:id/claim` | Yes | — | `204`; makes an unassigned task private to you. |
| `PUT /items/:id` | Yes | All four task input fields below | `200` updated task. |
| `PATCH /items/:id` | Yes | At least one task input field below | `200` updated task. |
| `DELETE /items/:id` | Yes | — | `204`; deletes an owned task. |

There is no single-task GET endpoint or public notifications endpoint. The active
routers are [auth](../src/modules/auth/routes.ts) and
[tasks](../src/modules/tasks/routes.ts), mounted by [app.ts](../src/app.ts).

## Payloads and ownership

Email addresses are trimmed and lowercased, must be valid, and have a maximum
length of 254 characters. Registration passwords must be 12–128 characters;
login and deletion accept 1–128. Account deletion accepts only `password` in
its body. It leaves other users' tasks, unassigned tasks, and operational event
history intact.

Task input fields:

| Field | Accepted value |
| --- | --- |
| `name` | String, trimmed to 1–255 characters. |
| `completed` | Boolean; required for PUT, optional for PATCH, forced to `false` on POST. |
| `deadline` | ISO date `YYYY-MM-DD`, or `""` for no deadline. |
| `priorisation` | `"high"`, `"medium"`, or `"low"` (this spelling is part of the API). |

Example task response:

```json
{
  "id": "42",
  "name": "Write documentation",
  "completed": false,
  "deadline": "2026-10-01",
  "priorisation": "high",
  "userId": "account-id"
}
```

Unassigned tasks have `userId: null`. Use the string `id` returned by this API:
it represents the new MySQL `task_key`, not the legacy SQLite ID. IDs must be
positive decimal integers at most `4294967295`. Only an owner can update or
delete a task; claim an unassigned task first. Concurrent claims have one winner.
PUT/PATCH optionally accept `x-correlation-id` for event tracing (maximum 64
characters used); the server generates one if omitted.

## Errors

Handled API errors have an `error` code, for example
`{"error":"unauthenticated"}`. Validation may include `issues`. Malformed JSON,
unmatched routes, and unexpected server failures use Express defaults, so do
not assume every error response is JSON.

| Status | Error code / meaning |
| --- | --- |
| `400` | `invalid_request` for registration/login validation; `invalid_deletion_request` for deletion validation; `invalid_task` for task validation. |
| `401` | `unauthenticated` for missing/expired sessions; `invalid_credentials` for incorrect login. |
| `403` | `invalid_password` when account deletion password is incorrect. |
| `404` | `task_not_found` for invalid task IDs or attempts to update/delete missing, unassigned, or another user's tasks. |
| `409` | `email_taken` on registration; `task_unavailable` if a valid claim ID is missing or already owned. |
| `429` | `too_many_attempts` for throttled registration/login; `Retry-After` gives seconds to wait. |
| `503` | `auth_unavailable` on `/auth` and `/items` when MySQL authentication is not configured. |

## Example session

With the local stack running, register and retain the cookie in a local file:

```sh
curl -i -c /tmp/kanban-cookies.txt http://localhost:3000/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"developer@example.com","password":"local-example-password"}'

curl -b /tmp/kanban-cookies.txt http://localhost:3000/items \
  -H 'Content-Type: application/json' \
  -d '{"name":"Write documentation","deadline":"","priorisation":"medium"}'

curl -b /tmp/kanban-cookies.txt http://localhost:3000/items

curl -i -b /tmp/kanban-cookies.txt -X POST http://localhost:3000/auth/logout
rm /tmp/kanban-cookies.txt
```

For an existing account, use `/auth/login` instead of `/auth/register`.
