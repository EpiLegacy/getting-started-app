# ADR 0003 — Keep legacy todos unassigned until claimed

- **Status:** Accepted (implemented)
- **Date:** 2026-09-24 (documentation date)
- **Related documents:** [Drizzle decision](0001-adopter-drizzle-orm.md); [ownership migration](../../drizzle/0002_task_ownership.sql); [migration runbook](../../drizzle/README.md#move-from-legacy-sqlite-to-mysql); [API reference](../api.md)

## Context

Before authentication, todos belonged to a shared anonymous list. Existing records contain no reliable account identity, so introducing users does not tell us who originally created or should own each task.

The legacy schema also permits duplicate or NULL task IDs. Reusing these values as the identity for ownership operations would make it impossible to reliably distinguish every existing row.

We needed to preserve the old tasks while making newly created tasks private to their authenticated owner. The transition must avoid guessing ownership, discarding records, or allowing one account to modify another account's tasks.

## Decision criteria

- Preserve existing MySQL task rows and legacy values.
- Avoid inventing ownership where no identity was recorded.
- Make the transition understandable and actionable in the interface.
- Enforce ownership in backend queries, independent of frontend visibility.
- Give simultaneous claims one winner without overwriting an existing owner.
- Prevent deployment or rollback from silently exposing private tasks.

## Options considered

### Delete or archive legacy tasks outside the app

This would simplify authorization but remove active work from the normal workflow. It does not meet the preservation and continuity requirements.

### Assign every legacy task to an administrator or the first registered user

This would populate ownership immediately but imply a relationship the data cannot establish. It would give one account control over everyone else's former shared work.

### Keep all legacy tasks permanently shared and editable

This would retain the anonymous workflow but leave two permission models in place indefinitely. Shared editing would not provide a clear transition into private ownership.

### Keep legacy tasks unassigned and allow authenticated users to claim them

This preserves access to the old work while requiring an explicit action before a task becomes private. It cannot prove historical authorship, but it avoids pretending that authorship can be recovered from the data. This is the selected option.

## Decision

**Preserve legacy todos with `user_id = NULL`. Show them in a separate unassigned list, where any authenticated user can claim a task. Once claimed, it belongs exclusively to that account.**

Tasks remain unassigned until someone claims them; there is no automatic assignment or expiration. Claiming is a choice of responsibility, not proof of original authorship. The current product has no approval, ownership-transfer, or unclaim endpoint.

All new tasks receive the authenticated user's ID on creation. Clients cannot choose another owner through task input fields.

### Stable identity without rewriting legacy data

Migration `0002_task_ownership.sql` adds an unsigned auto-increment `task_key` primary key. Every existing physical MySQL row receives its own key, including rows with duplicate or NULL legacy IDs. The original `id` column and its values remain intact.

The HTTP API exposes `task_key` as a string `id`. Clients must use IDs returned by the current API rather than cached legacy IDs. A nullable foreign key connects `user_id` to `users`, and an index on `(user_id, task_key)` supports owned and unassigned lists.

The SQLite import is a separate step with different preservation semantics: identical duplicates are collapsed and conflicting rows are retained for manual review. It must be reconciled using the migration runbook before enabling accounts.

### Authorization and claiming

- `GET /items` lists only the current user's tasks.
- `GET /items/unassigned` lists tasks whose owner is NULL, only for signed-in users.
- `POST /items/:id/claim` conditionally sets the owner only where `user_id IS NULL`.
- A successful claim returns `204`. A valid ID that is missing or already owned returns `409 task_unavailable`, without disclosing the owner.
- Competing claims use one conditional database update. Only the request that changes the unassigned row succeeds; later requests cannot replace its owner.
- Updates and deletes filter by both task key and current user. A missing or non-owned task returns `404 task_not_found`.

The frontend separates owned and unassigned tasks and refreshes its lists after a claim or claim conflict. Backend predicates enforce these rules even when a client bypasses the UI.

### Account deletion

Direct deletion of a referenced user is restricted by the task foreign key. The authenticated account-deletion flow verifies the current password and removes owned tasks and the account in one transaction; sessions are revoked through cascading deletion.

Claimed tasks are owned tasks and are deleted with that account. They do not return to the unassigned pool. Other users' tasks and tasks that were never claimed remain unchanged. Operational event history is not purged by this flow.

## Consequences

### Benefits

- Legacy work remains discoverable without fabricating ownership.
- Every migrated MySQL row has an unambiguous identity.
- New and claimed tasks follow one ownership model.
- Claim races cannot transfer a task away from the winning account.
- Users can move legacy work into their personal list gradually.

### Tradeoffs and limits

- Any signed-in user can see and claim unassigned tasks. This shared visibility is an explicit transition policy, not a private archive.
- The system cannot verify the rightful historical owner. Mistaken or disputed claims require a separate operational decision; the current API does not resolve them.
- Unclaimed tasks can remain in the shared list indefinitely.
- Claiming changes visibility for other users, and account deletion permanently removes claimed tasks along with other owned tasks.
- Existing clients must adopt the new returned IDs and authenticated endpoints.

## Deployment and rollback

Stop writers and back up the databases before importing data or applying the ownership migration. Review SQLite import conflicts, apply journaled migrations through `npm run db:migrate`, then verify task values, generated keys, and NULL ownership before opening the app to users. Adding the primary key rebuilds the table, so allow an appropriate maintenance window.

Authentication and task routes require MySQL/Drizzle regardless of `PERSISTENCE_DRIVER`. Do not run an older anonymous API alongside the authenticated application.

After claims begin, rollback to the anonymous API would expose private tasks. Changing the persistence flag is not an authorization rollback. Keep an ownership-aware API in place, or take the application offline while preparing a rollback that preserves access restrictions.

## Verification criteria

- Existing MySQL rows and legacy values survive the schema migration.
- Generated task keys are unique and non-NULL; pre-account tasks start unassigned.
- Anonymous requests cannot list, claim, create, update, or delete tasks.
- A user cannot update or delete another user's task or an unassigned task.
- Concurrent claims produce exactly one winner.
- Account deletion removes owned and claimed tasks without reassigning them or affecting unrelated tasks.

## Revisit this decision if

- Legacy data can be mapped reliably to verified accounts.
- Shared visibility is no longer acceptable for remaining unassigned tasks.
- The product requires administrator approval, transfers, team ownership, or dispute resolution.
