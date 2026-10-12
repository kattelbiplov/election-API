# Module 07 — Reporting & Analytics

Status: **Built**. Endpoint: `GET /reports/dashboard`. Full response schema: `docs/openapi.yaml`
or `/api-docs`.

## What this module is — and isn't

No new entities. `reports.service.ts` aggregates counts live from tables every earlier module
already owns (Household, Voter, CanvassingTask, CanvassingVisit, VoterContact) — there is no
`Report` table, no scheduled rollup job, no cached/precomputed numbers. Every call to
`GET /reports/dashboard` runs a fresh set of `COUNT`/`GROUP BY` queries. That's a deliberate
tradeoff for a first pass: correctness and simplicity (numbers are always current, there's no
cache-invalidation problem to get wrong) over the query cost of aggregating on every request. If
this endpoint becomes a hot path for a campaign with a large roll, revisit with caching or a
materialized rollup then — not preemptively now.

## One endpoint, not five

The obvious alternative was a separate endpoint per section (`/reports/voters`,
`/reports/canvassing`, `/reports/contacts`, ...). A single `GET /reports/dashboard` returning a
nested summary was chosen instead because that's what was actually asked for — one dashboard, not
a family of report resources — and because every section needs the same scoping logic
(`wardId`/`toleId` + the caller's own geo access) computed once, not duplicated four times.
Splitting it later, if a frontend genuinely wants to fetch sections independently, is a small
change (the four aggregation blocks in `getDashboard` are already independent `Promise.all`
entries) — not a rewrite.

## Scoping: same rule as every list endpoint, not a new one

`GET /reports/dashboard` is gated on a new `report:read` permission — granted to
`CAMPAIGN_ADMIN`, `WARD_MANAGER`, `TOLE_COORDINATOR`, `ANALYST`, `VIEW_ONLY`. **Not**
`FIELD_WORKER`/`VOLUNTEER`: they have no use case for campaign-wide analytics, only for their own
assigned households/voters/tasks, which is exactly what their existing permissions already cover.

For the roles that do have access, geo-scoping matches `households.service.ts`/`voters.service.ts`
exactly — a `WARD_MANAGER`/`TOLE_COORDINATOR` only ever sees their own assigned ward/tole, applied
as an `OR` filter combined with any explicit `wardId`/`toleId` query parameter. One consequence
worth calling out because it differs from most of this API: **passing a `wardId`/`toleId` outside
the caller's scope returns an all-zero summary, not a 403.** This isn't a bug — it's the same
"scope filter AND explicit filter, combined" pattern `listHouseholds`/`listVoters` already use,
where an out-of-scope explicit filter simply matches nothing rather than needing a separate
authorization check. A `wardId`/`toleId` that doesn't exist at all still 400s.

## Every enum key is always present, zero-filled

Each breakdown (`byStatus`, `byGender`, `bySupportLevel`, `byOutcome`, `byMethod`) is a full map
over every possible enum value, defaulting to `0` — not just the values that happen to have data.
This is specifically so a frontend chart doesn't need its own knowledge of "what are all the
possible support levels" to render a complete legend; it can just iterate the map's keys. There's
also always an `UNSET` key in every map (from the shared `fillEnumCounts` helper in
`reports.service.ts`) — it's only ever nonzero for a genuinely nullable grouping column
(`Voter.gender` is the only one today), but the helper is deliberately uniform across nullable and
non-nullable columns rather than having two slightly different versions.

## What was intentionally NOT built here

- **Time-series / trend data** ("contacts per day over the last 30 days"). Every number in this
  endpoint is a current-state total, not a history. Bucketing by date is a meaningfully different
  kind of query (and a meaningfully different UI — a chart, not a stat tile) that wasn't part of
  what was asked for in this pass.
- **Per-user / per-volunteer leaderboards** ("who's logged the most contacts this week"). Natural
  extension once individual accountability/gamification is an actual requirement, not before.
- **Caching, materialized views, or a scheduled rollup job.** Covered above — deliberately
  deferred until the live-aggregation approach actually proves too slow for real usage.
- **Export (CSV/PDF).** This is a JSON API endpoint for a frontend to render; generating a
  downloadable report file is a separate, presentational concern.
