# Module 04 — Canvassing Tasks

Status: **Built**. Endpoints live under `/api/v1/canvassing-tasks`, including
`/canvassing-tasks/{id}/visits`. Full request/response schemas: `docs/openapi.yaml` or
`/api-docs`.

## What this module is for

Modules 01–03 gave the platform Households, Voters, and the roles to record them
(`FIELD_WORKER`, and now `VOLUNTEER`). Nothing yet let a `WARD_MANAGER`/`TOLE_COORDINATOR`
actually *direct* that work — assign a specific set of households to a specific person with a
deadline, and track who's done what. That's this module.

## Shape: mirrors Voter Import, not Households

A `CanvassingTask` (the assignment: who, what area, due date) plus a `CanvassingVisit` per
targeted household (the outcome) is deliberately the same two-level shape as
`VoterImportJob`/`VoterImportRowIssue` from Module 02: the "batch" record and its per-item
results, snapshotted once at creation rather than computed by a live join every time someone
asks "how's this task going?" `GET /canvassing-tasks/{id}` and the list endpoint both return a
`visitSummary` (counts by outcome) computed with one `GROUP BY` — not stored/denormalized on the
task row, since visits (unlike import rows) keep changing after creation and a stored counter
would need constant upkeep to stay correct.

## One assignee per task

A task has exactly one `assignedToId` — no multi-assignee tasks. Splitting canvassing work
across several people means creating several tasks, each covering a different household subset.
This sidesteps shared-ownership questions a multi-assignee task would raise (who marks it done?
do all assignees see all visits?) that weren't worth solving for a first pass.

`assignedToId` must be an **active `FIELD_WORKER` or `VOLUNTEER`** — the two roles that actually
do door-to-door work (see the `VOLUNTEER` note in `01-auth-rbac-geo.md`) — and must already have
a `UserGeoAssignment` covering the task's `wardId`/`toleId`. Creating a task never grants geo
access; it requires the access already exist, same relationship as everywhere else
`UserGeoAssignment` is checked in this codebase. A `WARD_MANAGER`/`TOLE_COORDINATOR` creating the
task also needs their own geo access to that ward/tole (`assertGeoScopeAccess`) — same rule,
applied to the creator as well as the assignee.

## How households get on a task

`POST /canvassing-tasks` accepts either:
- an explicit `householdIds` array, or
- nothing — in which case it auto-selects **every household currently in `toleId`** (or all of
  `wardId` if `toleId` is omitted too).

Either way, the resulting household set is snapshotted into `CanvassingVisit` rows
(`outcome: PENDING`) at creation time — adding a household to that tole *after* the task exists
does not retroactively join the task. Capped at `TASK_MAX_HOUSEHOLDS` (500) per task
(`tasks.service.ts`) as a sanity limit, not a hard architectural ceiling; a manager who needs
more should split the work into multiple tasks anyway (see "one assignee per task" above).

## Status is derived, not manually driven (mostly)

`PENDING → IN_PROGRESS → COMPLETED` is recomputed automatically after every
`PATCH .../visits/{visitId}` call (`recomputeTaskStatus` in `tasks.service.ts`): `IN_PROGRESS` as
soon as any visit leaves `PENDING`, `COMPLETED` once none remain `PENDING`. Correcting a visit
back to `PENDING` un-completes the task the same way — there's no one-way ratchet. The one
manual lever is `CANCELLED`, set directly via `PATCH /canvassing-tasks/{id}`
(`{ "status": "CANCELLED" }`) by a manager abandoning a task; once cancelled, visit updates on it
are rejected (400) and the auto-derivation stops touching it — a stray visit correction can't
resurrect a cancelled task.

## Visibility: workers see only their own tasks

`GET /canvassing-tasks` and `GET /canvassing-tasks/{id}` behave differently depending on the
caller's role:

- `FIELD_WORKER`/`VOLUNTEER`: **always** `assignedToId = <themselves>`, full stop — any
  `assignedToId` they pass in the query is silently ignored, not merely defaulted. There's no
  "browse other people's queues" for these roles, even within their own tole.
- Every other role (`CAMPAIGN_ADMIN`, `WARD_MANAGER`, `TOLE_COORDINATOR`, `ANALYST`,
  `VIEW_ONLY`): the usual `assertGeoScopeAccess`/`getAccessibleGeoScope` pattern from
  Households/Voters — ward-level assignment sees the whole ward, tole-level assignment sees just
  that tole, org-wide roles see everything in the org.

This is why `GET /canvassing-tasks/{id}` for a worker who isn't the assignee 403s even if the
task is in their tole (`assertTaskAccess` checks `assignedToId` directly for worker roles,
instead of falling back to the coarser ward/tole check).

## What was intentionally NOT built here

- **Voter-level contact outcomes / support scoring.** Visits are household-level
  (`visited`/`not-home`/`refused`/`invalid-address`) — recording who specifically was spoken to
  within a household and their support level is voter engagement/canvassing-results territory, a
  separate module not built yet. Keeping the two apart was a deliberate scoping call, not an
  oversight.
- **Multi-assignee tasks / task reassignment history.** `assignedToId` can be changed via
  `PATCH`, but there's no audit trail of *who* it was previously assigned to beyond the generic
  audit log entry — no dedicated "reassignment history" view.
- **Recurring/templated tasks.** Every task is a one-off; there's no "repeat this every week"
  concept. A manager creating the same canvassing round weekly does so by creating a new task
  each time.
- **Notifications.** Nothing pushes an alert to a `FIELD_WORKER`/`VOLUNTEER` when a task is
  assigned to them — they'd need to check `GET /canvassing-tasks?status=PENDING` themselves (or a
  frontend polls it). Push/SMS notification is a cross-cutting concern better handled once a
  Communications module exists, not bolted onto this one.
