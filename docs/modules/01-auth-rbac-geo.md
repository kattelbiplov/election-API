# Module 01 — Auth, RBAC & Nepal Geo Structure

Status: **Built**. Endpoints live under `/api/v1/{auth,organizations,users,provinces,districts,municipalities,wards,toles,audit-logs}`.
Full request/response schemas: `docs/openapi.yaml` or `/api-docs`.

## What this module is for

Everything else in the platform (voters, households, tasks, issues...) needs to answer three
questions before it can do anything: *who is asking*, *what are they allowed to do*, and *where
(geographically) does this data live*. This module builds those three foundations:

1. **Auth** — login/refresh/logout, JWT access tokens + rotating refresh tokens.
2. **RBAC** — 7 roles, a static permission matrix, and geographic scoping on top of it.
3. **Geo structure** — Nepal's official administrative hierarchy (Province → District →
   Municipality → Ward) plus campaign-defined Toles underneath.

## Multi-tenancy: Organization

Every campaign that uses this platform is an `Organization`. This wasn't in the MVP list as a
named feature, but it's added now (not deferred to the Phase-3 SaaS work) because retrofitting a
tenant column onto Users/Households/Voters *after* real data exists is a costly migration; adding
it as a foreign key from day one costs almost nothing. Concretely: every `User` belongs to one
`Organization`; every `Tole` belongs to one `Organization` (see below for why); everything else in
later modules (households, voters, tasks) will hang off `organizationId` the same way.

`SUPER_ADMIN` accounts (platform operators — us, not campaign staff) live in a reserved
`platform` organization created by the seed script, purely so the `organizationId` column can stay
`NOT NULL` everywhere. Their permissions are not limited by that org membership.

## Roles & permission matrix

Routes never check `role` directly — they declare a required **permission**, and a static
`ROLE_PERMISSIONS` map (`src/middleware/permissions.ts`) decides which roles have it. To change who
can do what, edit that one file; no route files change.

| Permission | SUPER_ADMIN | CAMPAIGN_ADMIN | WARD_MANAGER | TOLE_COORDINATOR | FIELD_WORKER | VOLUNTEER | ANALYST | VIEW_ONLY |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Manage organizations | ✅ | own org only | | | | | | |
| Create/update/deactivate users | ✅ | ✅ (own org) | | | | | | |
| Assign users to ward/tole | ✅ | ✅ | | | | | | |
| Read users | ✅ | ✅ | ✅ | ✅ | | | ✅ | |
| Read geo (provinces...toles) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Manage provinces/districts/municipalities | ✅ | | | | | | | |
| Create/update wards | ✅ | ✅ | | | | | | |
| Create/update toles | ✅ | ✅ | create+update, own ward only | update, own tole only | | | | |
| Delete toles | ✅ | ✅ | | | | | | |
| Read audit logs | ✅ (platform-wide) | ✅ (own org) | ✅ (own org) | | | | ✅ (own org) | |

VOLUNTEER isn't just "no permissions" for the rows above — see the note right after this table.
It has the exact same household/voter permissions as FIELD_WORKER (household/voter create+read
within their assigned tole, plus voter update); that matrix isn't repeated here since it was
introduced in Module 02, not this one — see `02-households-voters.md`.

**Geographic scoping is a second, separate check on top of the permission check.** A
`WARD_MANAGER` has the `geo:tole_create` permission, but that alone doesn't let them create a tole
in *any* ward — `src/middleware/geoScope.ts` additionally checks they have a `UserGeoAssignment`
row for that specific ward. This is why a 403 on a tole/ward write can mean either "your role can't
do this at all" or "you're not assigned to this ward" — the error `message` distinguishes them, but
the frontend shouldn't need to: if you got a 403, the action isn't available, full stop.

`UserGeoAssignment` (`POST /users/{id}/assignments`) is how a `CAMPAIGN_ADMIN` grants a
`WARD_MANAGER`/`TOLE_COORDINATOR`/`FIELD_WORKER`/`VOLUNTEER` their working area. A ward-level
assignment (`toleId` omitted) covers the whole ward; a tole-level assignment scopes to just that
tole.

### VOLUNTEER (added post-launch, alongside Modules 02/03)

`VOLUNTEER` is a login-capable role — a full `User` account like any other, created the normal
way via `POST /users` — with the **exact same permission set as `FIELD_WORKER`**
(`FIELD_WORKER_PERMISSIONS` in `src/middleware/permissions.ts` is shared by both role keys, not
copy-pasted, so they can't silently drift apart). It exists as a distinct role rather than just
using `FIELD_WORKER` because campaigns track volunteers — an unpaid, roster-managed population —
separately from paid field staff for their own reporting/coordination purposes, even though the
two can do identical things in the app today. If a real capability difference between them ever
comes up, split `VOLUNTEER`'s permission array off from `FIELD_WORKER_PERMISSIONS` at that point.

`User` also gained three optional bio fields alongside this role — `address`, `dateOfBirth`,
`gender` (the last reusing the `Gender` enum introduced for `Voter` in Module 02). They're plain
nullable columns on `User`, not a separate profile table: mainly meaningful for
`VOLUNTEER`/`FIELD_WORKER` accounts, left `null` for everyone else, same pattern as the existing
optional `phone` field. Geographic assignment for a volunteer uses the same
`POST /users/{id}/assignments` endpoint as every other scoped role — there's no separate
"volunteer assignment" mechanism.

## Nepal geo hierarchy: what's global vs. what's per-campaign

```
Province ─┬─ District ─┬─ Municipality ─┬─ Ward ─┬─ Tole (organization-scoped)
          │             │                │        └─ Tole (organization-scoped)
          │             │                └─ Ward ─┬─ ...
```

- **Province, District, Municipality, Ward** are Nepal's *official* administrative units — the
  same for every campaign operating in that area. They're global reference data, writable only by
  `SUPER_ADMIN` (provinces/districts/municipalities) or `SUPER_ADMIN`/`CAMPAIGN_ADMIN` (wards —
  campaigns occasionally need to add a ward the official dataset is missing).
- **Tole** is *not* an official government unit — tole boundaries and even names are informal and
  vary by who's describing them. Two campaigns in the same ward may define different toles. That's
  why `Tole` carries an `organizationId` and every tole endpoint is implicitly scoped to the
  caller's organization.

Do not hand-type Nepal's full official dataset (7 provinces, 77 districts, 753 local levels,
~6,700 wards) into the seed script — the seed only creates one representative province/district/
municipality/ward for local development. Loading the real dataset is a one-time import job that
belongs to the **Voter Data Import module** (spec section 4), sourced from an authoritative
Election Commission Nepal / National Statistics Office dataset, not typed by hand.

## PostGIS: enabled now, used later

The `postgis` Postgres extension is enabled by the seed script so it's available, but no table in
this module uses a native `geometry` column yet — `Tole.boundary` is a plain `Json` (GeoJSON)
field. Wiring up real `geometry`/`geography` columns with spatial indexes (`ST_Contains`,
`ST_DWithin`, etc.) is deliberately deferred to the **Household GIS module**, which is the first
module that actually needs spatial queries ("households within this polygon", "nearest polling
center"). Adding PostGIS geometry columns to Ward/Tole now, before anything queries them
spatially, would be premature.

## Auth mechanics

- Access tokens: JWT, 15 min default TTL, signed with `JWT_ACCESS_SECRET`. Contains `sub` (user
  id), `organizationId`, `role`. Stateless — not checked against the DB on every request, so a
  role change or account suspension takes effect on the user's *next token refresh*, not
  instantly. (A future "kill session now" admin action would need to force this via token
  blocklist — not built yet, flag if you need it sooner than a later module.)
- Refresh tokens: opaque random strings (not JWTs), 30 days default TTL. Only a SHA-256 hash is
  stored server-side (`refresh_tokens.token_hash`) — mirrors how passwords are hashed, so a
  database leak alone doesn't hand out usable sessions. They **rotate**: every `/auth/refresh` call
  revokes the presented token and returns a new one.
- Passwords: bcrypt, 12 salt rounds. Minimum 10 characters + a letter + a digit/symbol — enforced
  both at user-creation and change-password time.
- Login does not reveal whether the *email* or the *password* was wrong — same generic message and
  (via a dummy-hash bcrypt compare) the same rough response time either way.

## Audit logging

Every mutating endpoint in this module writes an `AuditLog` row after the operation succeeds
(action, entity type/id, before/after snapshot, actor, IP, user agent). This is a cross-cutting
concern every future module must follow the same pattern for — see `src/utils/audit.ts`. Audit
write failures are logged but never fail the request itself.

## What was intentionally NOT built here

- **Self-service signup.** Accounts are always created by an admin (`CAMPAIGN_ADMIN`+) via
  `POST /users`, never by the user themselves — matches the spec's "field workers are
  admin-provisioned, not self-registering" implication and avoids an open registration surface on
  an app handling voter data.
- **Dynamic/custom roles or a permissions table.** Seven fixed roles with a static in-code
  permission map, not a fully generalized RBAC system with role CRUD. The spec's role list is
  fixed and this avoids building admin UI for a feature nobody asked for; if custom roles become a
  real requirement later, `ROLE_PERMISSIONS` becomes a DB table without changing any route code
  (every route already goes through `requirePermission()`, never a raw role check).
- **Immediate session revocation on role change/suspension.** Documented above — acceptable for
  MVP given the 15-minute access token TTL, revisit if that's too long for a suspended-user case.
