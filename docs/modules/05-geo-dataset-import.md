# Module 05 — Nepal Geo Dataset Import

Status: **Built**. Endpoint: `POST /geo/import`. Full request/response schema:
`docs/openapi.yaml` or `/api-docs`.

## What this module is — and isn't

Module 01's seed script deliberately creates only one sample province/district/municipality/ward
for local development, with an explicit note that the real dataset (7 provinces, 77 districts,
753 local levels, ~6,700 wards) should come from a one-time import job "sourced from an
authoritative Election Commission Nepal / National Statistics Office dataset, not typed by hand."
This module is that import job.

**This module contains no actual Nepal geography data.** `geo.import.ts` only knows how to
validate and map a row shape — it doesn't embed, fetch, or fabricate the real dataset. That's a
deliberate boundary, not a shortcut: inventing plausible-looking administrative codes/names would
risk someone mistaking fabricated data for the real official dataset, in a system whose whole
purpose is to hold accurate geography for real campaigns. The actual file — sourced from EC Nepal
or the NSO's local-level directory — is something the campaign/operator provides.

## File format

One row = one **municipality**, with its parent province and district repeated alongside it (a
flat, denormalized shape — how this kind of reference list is normally published, rather than
three separate normalized files). Headers are matched case-insensitively after normalizing to
`snake_case`; unrecognized columns are ignored.

| Column | Required | Notes |
|---|---|---|
| `province_code` (`province_number`) | ✅ | Positive integer |
| `province_name` | ✅ | |
| `province_name_nepali` | | |
| `district_code` | ✅ | |
| `district_name` | ✅ | |
| `district_name_nepali` | | |
| `municipality_code` (`local_level_code`) | ✅ | |
| `municipality_name` (`local_level_name`) | ✅ | |
| `municipality_name_nepali` (`local_level_name_nepali`) | | |
| `municipality_type` (`local_level_type`, `type`) | ✅ | `METROPOLITAN_CITY` / `SUB_METROPOLITAN_CITY` / `MUNICIPALITY` / `RURAL_MUNICIPALITY`, or common variants (`Metropolitan City`, `Rural Municipality`, `Gaunpalika`, etc — see `MUNICIPALITY_TYPE_ALIASES` in `geo.import.ts`) |
| `total_wards` (`ward_count`, `number_of_wards`) | ✅ | Integer, 1–35 |

There is **no per-ward row** — the real dataset's ward-level detail is essentially just a count
per municipality, not distinct per-ward attributes, so requiring ~6,700 individual ward rows
would add nothing but file size. Instead, the import creates `Ward` rows numbered `1..total_wards`
for each municipality automatically.

## Upsert behavior (safe to re-run)

Province/District/Municipality are upserted by their official code — `Province.code`,
`(provinceId, District.code)`, `(districtId, Municipality.code)` — matching the unique
constraints already on those models from Module 01. Re-importing the same file (or a corrected
one) is safe:

- A matching existing row has its name/type/`total_wards` updated only if something actually
  changed (no-op writes are skipped, not forced).
- Wards are **never deleted**, even if a corrected file lowers `total_wards` for a municipality —
  by the time real data exists, a ward may carry `UserGeoAssignment`s or households, so silently
  removing it would cascade real damage. The import only ever adds missing ward numbers; it takes
  `max(existing total_wards, new total_wards)` as the ceiling for which numbers to ensure exist.
- Rows are processed one at a time (not one big transaction) so a bad row further down the file
  doesn't roll back everything already imported — same "partial success is fine, report what
  failed" philosophy as Voter Import (Module 02).

## Why no job/issue tables like Voter Import

Module 02's `VoterImportJob`/`VoterImportRowIssue` persist import history because voter imports
happen repeatedly, per-ward, by non-`SUPER_ADMIN` staff who need to review results later via a
separate endpoint. This import is the opposite profile: rare (administrative reference data
changes on Nepal's own multi-year timeline, not per campaign), `SUPER_ADMIN`-only, and global
(not scoped to an org or a ward someone needs to revisit). So the result is returned directly and
synchronously from the request (`GeoImportSummary`: counts by outcome + a `rowNumber`/`message`
per invalid row) rather than persisted as browsable job history. The action itself is still
audit-logged (`action: "geo.import"`), same as every other mutating endpoint in this codebase.

## What was intentionally NOT built here

- **The actual dataset.** Covered above — this is the tool, not the data.
- **Ward-level attributes beyond a count** (population, boundary, official ward name). Nothing in
  the source format this module expects carries that, and `Ward.population`/`name` remain
  editable individually via the existing `PATCH /wards/{id}` from Module 01 if a campaign wants to
  fill them in by hand for the wards they actually operate in.
- **A shared generic bulk-upsert framework.** This and Voter Import both parse
  CSV/Excel via the same `src/utils/fileImport.ts` (extracted during this module's work, since it
  was previously duplicated only inside `voters.import.ts`), but the row validation and upsert
  logic are separate, module-specific functions — the two imports have different enough shapes
  (org-scoped batch-with-history vs. global upsert-in-place) that forcing them through one
  abstraction would cost more than it saves right now.
