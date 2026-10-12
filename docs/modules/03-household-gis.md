# Module 03 — Household GIS

Status: **Built** (partial scope — see "What was intentionally NOT built here"). New endpoints:
`GET /households/nearby`, `POST /households/search/within-polygon`,
`GET /toles/{id}/boundary-check`. Full schemas: `docs/openapi.yaml` or `/api-docs`.

## What this module is for

Modules 01 and 02 stored location informally: `centerLat`/`centerLng` floats on `Tole` and
`Household`, and a plain `Json` GeoJSON `boundary` on `Tole`. That was deliberate — see the design
notes at the top of the Module 01/02 sections in `prisma/schema.prisma` — because nothing queried
them spatially yet. This module is the point where something finally does, so it adds the real
PostGIS geometry columns and the queries that need them:

- `Household.location` — `geometry(Point, 4326)`, GiST-indexed.
- `Tole.boundaryGeom` — `geometry(Polygon, 4326)`, GiST-indexed.

## The plain columns stay the source of truth for the API

`centerLat`/`centerLng` and `boundary` (Json) are **not removed or replaced**. The API still
reads and writes them exactly as before — no breaking change to Module 01/02's contract. The new
geometry columns are populated by the service layer as a derived, always-in-sync side effect:

- `households.geo.ts` → `syncHouseholdLocation()` — called from `households.service.ts`'s
  `createHousehold`/`updateHousehold`, inside the same `$transaction` as the write, whenever
  `centerLat`/`centerLng` are part of the input.
- `geo.geometry.ts` → `syncToleBoundaryGeom()` — called from `geo.service.ts`'s
  `createTole`/`updateTole`, same pattern, whenever `boundary` is part of the input.

This split exists because **Prisma cannot do anything else with these columns**: `geometry` isn't
a type Prisma Client understands, so both fields are declared `Unsupported("geometry(...)")` in
`schema.prisma`. An `Unsupported` field can't appear in `select`, `where`, `create`, or `update`
through the normal Prisma Client API — every read or write against it goes through
`$queryRaw`/`$executeRaw`. That's why the sync helpers and the spatial queries below live in
dedicated `*.geo.ts`/`*.geometry.ts` files instead of the regular `*.service.ts` files: it keeps
"ordinary CRUD through Prisma's query builder" and "raw SQL against a geometry column" from
tangling together in the same function.

## Endpoints

### `GET /households/nearby`

`ST_DWithin` against `location::geography` (cast to `geography`, not left as `geometry`, so the
radius is in real meters rather than degrees of latitude/longitude). Returns households ordered
nearest-first with a `distanceMeters` field. Radius is capped at 5000m
(`NEARBY_MAX_RADIUS_METERS`) to keep worst-case query cost bounded — this queries by distance
across a whole organization otherwise, and there's no other index that would keep an unbounded
radius cheap.

### `POST /households/search/within-polygon`

`ST_Contains` of an arbitrary caller-supplied GeoJSON polygon against `location`, scoped to a
single ward. This is for exploring an area *before* it becomes a saved `Tole` — e.g. "draw a
rough canvassing boundary on a map and see who's inside it" — as opposed to...

### `GET /toles/{id}/boundary-check`

...the reverse and arguably more useful query: households already **assigned** to a tole (via
the plain `toleId` foreign key) whose actual point location falls **outside** that tole's drawn
`boundaryGeom`. This is a data-quality report, not a listing — it exists to catch geocoding
mistakes and stale assignments after a tole's boundary is drawn or redrawn, which is a real
failure mode once toles have real polygons instead of just a name. 400s if the tole has no
boundary set yet.

This endpoint lives under `/toles/{id}/...` (geo module) but is gated on `household:read`, not
`geo:read`, and uses the tole-scoped `assertGeoScopeAccess` check (not the coarser
`assertWardAccess` every other tole endpoint uses) — because the response is household PII, not
tole metadata, and the usual household-read scoping rules (see Module 02's doc) apply to it just
as much as to `GET /households`.

## Why point + polygon, not more

This pass covers exactly two pieces, by design (scoped down from a larger list of GIS
possibilities before starting):

- Household point geometry + nearby/within-polygon spatial queries.
- Tole boundary polygon geometry + the boundary-check query.

## What was intentionally NOT built here

- **Address-matched import.** Module 02 explicitly deferred "voter import auto-links to an
  existing Household by proximity" to this module. It's still not built — this pass adds the
  *capability* (households now have real point geometry an import step could match against) but
  not the import-time matching logic itself. A natural next step, not done now because it changes
  `voters.service.ts`'s import path and deserved its own explicit scoping decision rather than
  being bundled in silently.
- **A `PollingCenter` entity / "nearest polling center" query.** Not a concept that exists
  anywhere else in this codebase yet (no module has introduced it) — inventing an entity purely
  to demo a spatial query would be scope creep. If a future module introduces polling
  centers/task locations, "nearest to a household" is a small addition to `households.geo.ts` at
  that point, not a redesign.
- **Ward boundaries.** `Ward` still has no boundary field at all (geometry or otherwise) — it's
  Nepal's official administrative geometry and isn't something a campaign draws or edits, so
  populating it is a data-loading problem (an authoritative EC/NSO shapefile import), not a
  schema problem. Out of scope here; flag if a "households within this ward's real boundary"
  query becomes a real requirement before that import job exists.
