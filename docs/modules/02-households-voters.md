# Module 02 — Households, Voters & Voter Import

Status: **Built**. Endpoints live under `/api/v1/{households,voters}`, including
`/voters/import` and `/voters/import-jobs`. Full request/response schemas: `docs/openapi.yaml`
or `/api-docs`.

## What this module is for

The first place campaign data actually gets sensitive: real names, dates of birth, phone
numbers, addresses. Two things follow from that:

1. **Households** and **Voters** are read-scoped like write operations already were in
   Module 01 — a `TOLE_COORDINATOR`/`FIELD_WORKER` assigned to one tole cannot list or fetch
   records outside it, even though the equivalent restriction doesn't exist for the Geo module
   (province/district/.../tole are public administrative reference data, not PII). See
   `getAccessibleGeoScope`/`assertGeoScopeAccess` in `src/middleware/geoScope.ts`.
2. **Voter dedup has no reliable national ID to key off.** Nepal's voter rolls don't carry a
   single universal identifier that's consistently present across sources, so this platform
   dedupes on `(organizationId, wardId, normalizedName, dateOfBirth)` — a composite of the
   voter's name (lowercased, whitespace-collapsed) and date of birth, scoped to a ward. The
   EC-issued `voterIdNumber` and `citizenshipNumber` are stored when available but are
   **informational only**, not unique keys — they're too often missing or inconsistent in
   source data to be load-bearing.

## Households vs. Voters vs. the Household GIS module

`Household` is deliberately thin: a ward/tole + free-text `address` + an informal
`centerLat`/`centerLng` (same convention as `Tole.centerLat`/`centerLng` from Module 01). It
does **not** attempt to match or dedupe by address text — reliably deciding "is 123 Main St the
same as 123 Main Street" needs real geocoding, which is explicitly the Household GIS module's
job (PostGIS geometry columns, spatial indexes, `ST_DWithin`/`ST_Contains` queries), not this
one. Building fuzzy address matching here would be premature and likely wrong.

Consequently: a `Voter` can optionally link to a `Household` via `householdId` when created or
edited by hand, but **bulk CSV/Excel import never creates or matches Households** — imported
voters get their own free-text `address` field and no household link. Wiring up
import-time household matching is a natural follow-up once the GIS module exists to do the
matching properly.

## Voter import

### Scope: one ward per import

An import job is always scoped to exactly one `wardId` (optionally with a default `toleId`),
matching how every other write in this codebase already works — a `WARD_MANAGER` can only
import into a ward they're assigned to (`assertGeoScopeAccess`, same check `createHousehold`/
`createVoter` use). Only `CAMPAIGN_ADMIN` and `WARD_MANAGER` have the `voter:import` permission;
`TOLE_COORDINATOR`/`FIELD_WORKER` can create/edit voters individually but not bulk-import.

### Accepted file format

`.csv` or `.xlsx`, max 10MB, max 10,000 data rows per file (`IMPORT_MAX_ROWS`/
`IMPORT_MAX_FILE_BYTES` in `src/modules/voters/voters.import.ts`). Column headers are matched
case-insensitively after normalizing to `snake_case`; unrecognized columns are ignored rather
than rejected. Recognized columns (aliases in parentheses):

| Column | Required | Notes |
|---|---|---|
| `full_name` (`name`, `voter_name`) | ✅ | 2–150 chars |
| `date_of_birth` (`dob`, `birth_date`) | ✅ | `YYYY-MM-DD`, `DD/MM/YYYY` (day-first), or a native Excel date cell |
| `gender` (`sex`) | | `M`/`F`/`O` or `MALE`/`FEMALE`/`OTHER` |
| `tole_name` (`tole`) | | Matched case-insensitively within the job's ward; **auto-created** if not found (toles are informal/campaign-defined — see Module 01) |
| `father_or_spouse_name` (`father_name`, `spouse_name`, `father_spouse_name`) | | |
| `citizenship_number` (`citizenship_no`) | | informational, not a dedup key |
| `voter_id_number` (`voter_id`, `voter_no`) | | EC serial number, informational, not a dedup key |
| `phone` (`phone_number`, `mobile`, `mobile_number`) | | |
| `occupation` | | |
| `address` | | free text; not linked to a Household — see above |

### Processing model

Import runs **synchronously inside the HTTP request** — there is no job queue in this stack.
This is intentional for now: files are ward-sized (thousands, not millions, of rows), and adding
a queue (Redis/BullMQ or similar) before there's a real need for one would be premature
infrastructure. The row cap above exists specifically to keep worst-case request time bounded.
If campaigns start hitting that cap, a background queue is the natural next step — not built
now, flag it if you need it sooner.

Per-row outcome is one of:
- **Imported** — row is valid and doesn't match an existing or already-imported-this-run voter.
- **Duplicate** — matches the dedup key against either the DB (existing voters in this ward,
  loaded once up front into an in-memory set, not queried per row) or another row earlier in the
  same file. Recorded as a `VoterImportRowIssue` (`issueType: DUPLICATE`), not silently dropped —
  someone should be able to review what got skipped and why. A `P2002` unique-constraint
  violation at insert time (a rare race against a concurrent import into the same ward) is also
  caught and recorded as a duplicate rather than failing the whole job.
- **Validation error** — missing/unparseable `full_name` or `date_of_birth`, or an unrecognized
  `gender` value. Recorded as a `VoterImportRowIssue` (`issueType: VALIDATION_ERROR`) with the
  original raw row preserved in `rawData` so it can be fixed and re-submitted.

The job's final `status` is `FAILED` only if **zero** rows imported; otherwise
`COMPLETED_WITH_ERRORS` (some rows had issues) or `COMPLETED` (all rows imported cleanly).
`GET /voters/import-jobs/:id/issues` lists every skipped row with its reason — this is the
frontend's "review your import" screen.

## What was intentionally NOT built here

- **Address-based household matching during import.** Deferred to the Household GIS module —
  see above.
- **A background job queue for import.** Synchronous processing with a row cap, per above;
  revisit if ward-sized files stop being enough.
- **Voter merge/undelete tooling.** `DELETE /voters/:id` soft-deletes (for correcting a genuine
  data-entry mistake); `PATCH /voters/:id` with `status: DECEASED` or `MOVED` is the path for a
  voter who's still a real historical record but no longer active. There's no "merge these two
  voter records into one" endpoint yet — if two records turn out to be the same person despite
  passing the dedup check (e.g. a typo'd name), that's a manual fix today.
- **Import file storage/re-download.** The uploaded file itself isn't persisted anywhere after
  processing — only the parsed outcome (`VoterImportJob` + `VoterImportRowIssue` rows). If an
  admin needs to re-run a corrected file, they re-upload it.

## `supportLevel` (added post-launch, Module 06)

`Voter.supportLevel` is a single current classification —
`STRONG_SUPPORTER`/`LEAN_SUPPORTER`/`UNDECIDED`/`LEAN_OPPOSED`/`STRONG_OPPOSED`/`UNKNOWN`
(default), settable on create and update via the existing `voter:create`/`voter:update`
permissions — no new permission was needed, since assessing support level is just part of
recording what a `FIELD_WORKER`/`VOLUNTEER` learned about a voter, the same as any other field on
the record. It's filterable via `GET /voters?supportLevel=...`, so a `WARD_MANAGER` can pull
"everyone marked `STRONG_SUPPORTER` in my ward" for turnout-day outreach.

This is deliberately **only** a classification, not a history — there's no record of who set it,
what it was before, or when it changed beyond what the audit log already captures for any field
update. That history now exists separately — see below. **Org-defined issue tags** were also
scoped for the same original pass and remain deferred — real additional surface (a whole CRUD
subsystem for tags, not a field) that hasn't been approved yet.

## Contact history (added post-launch, Module 06 — third pass)

`POST /voters/{id}/contacts` / `GET /voters/{id}/contacts` — a per-voter log of contact
attempts (`method`: door knock/phone/text/email/event/other; `outcome`: reached/not
reached/refused/wrong contact info; free-text `notes`; `contactedAt`). Gated on `voter:update`
(create) and `voter:read` (list) — no new permissions were added, since logging a contact is
just another way of recording what's known about a voter, the same tier as editing the record
directly.

**Append-only, like `AuditLog`.** There is deliberately no `PATCH`/`DELETE` for a contact record
and no `updatedAt` column — correcting a wrong entry means logging a new one, not editing
history. This matters for a genuine "what actually happened, in order" record the way it doesn't
for most of this API's other resources.

**Two things a contact can affect beyond its own row:**
- `supportLevelObserved`, if set, overwrites `Voter.supportLevel` in the same transaction — the
  log and the voter's current classification can't drift apart, same philosophy as
  `CanvassingTask.status` being recomputed from visit outcomes (Module 04).
- `canvassingVisitId` optionally links a contact back to the `CanvassingVisit` (household-level
  outcome) that produced it — connecting voter-level engagement to field-ops provenance. If
  given, the visit's household must match the voter's `householdId` (400 if not); this is the
  only cross-check, not a full re-verification of the caller's access to that task.
