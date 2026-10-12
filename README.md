# Election Operations & Voter Intelligence Platform — API

Backend for Nepal local-level election campaign operations. See `docs/modules/` for a module-by-module
explanation of what's built and why, and `docs/openapi.yaml` (or `/api-docs` once running) for the
full API contract.

## Stack

- Node.js 20 + TypeScript + Express
- PostgreSQL 16 + PostGIS (via Prisma ORM)
- JWT access tokens + rotating opaque refresh tokens
- Zod for request validation
- Swagger UI for interactive API docs

## Getting started

```bash
cp .env.example .env
# edit .env: set real JWT_ACCESS_SECRET / JWT_REFRESH_SECRET
#   openssl rand -hex 48   (run twice, once per secret)

docker compose up -d          # starts Postgres+PostGIS on localhost:5432
npm install
npm run prisma:migrate        # creates the schema
npm run seed                  # seeds a super admin, a demo campaign, and sample geo data

npm run dev                   # http://localhost:4000, docs at /api-docs, map UI at /map
```

Seeded logins (from `npm run seed`, override with `SEED_SUPER_ADMIN_PASSWORD` /
`SEED_CAMPAIGN_ADMIN_PASSWORD` env vars before seeding):

| Role | Email | Password |
|---|---|---|
| SUPER_ADMIN | `superadmin@election-platform.local` | `ChangeMe123!` |
| CAMPAIGN_ADMIN (Demo Campaign) | `admin@demo-campaign.local` | `ChangeMe123!` |

## Scripts

| Command | Does |
|---|---|
| `npm run dev` | Start with hot reload |
| `npm run build` / `npm start` | Production build + run |
| `npm run lint` | ESLint |
| `npm test` | Vitest |
| `npm run prisma:migrate` | Create/apply a dev migration |
| `npm run prisma:studio` | Browse the DB in Prisma Studio |
| `npm run seed` | Seed reference/demo data |

## Project layout

```
src/
  config/        env, db (Prisma client), logger
  middleware/    auth, rbac (permissions), geoScope, validate, errorHandler, rateLimit
  modules/       one folder per domain module: routes -> controller -> service -> validation
  utils/         ApiError, response envelope, pagination, jwt, password, audit
prisma/
  schema.prisma  data model (see inline comments for design rationale)
  seed.ts
docs/
  openapi.yaml       machine-readable API contract (source of truth, served at /api-docs)
  modules/*.md       human-readable per-module explanation for the frontend team
public/
  map/               household map UI (plain HTML/CSS/JS, no build step) — served at /map
```

Each module follows the same request path: `routes.ts` (wires middleware + validation) →
`controller.ts` (HTTP concerns: parse req, call service, shape response, write audit log) →
`service.ts` (business logic, DB access) → `validation.ts` (Zod schemas).

## Status

- ✅ **Module 01 — Auth / RBAC / Nepal Geo Structure** — see `docs/modules/01-auth-rbac-geo.md`
- ✅ **Module 02 — Households, Voters & Voter Import** — see `docs/modules/02-households-voters.md`
- ✅ **Module 03 — Household GIS** — see `docs/modules/03-household-gis.md`
- ✅ **Module 04 — Canvassing Tasks** — see `docs/modules/04-canvassing-tasks.md`
- ✅ **Module 05 — Nepal Geo Dataset Import** — see `docs/modules/05-geo-dataset-import.md`
  (the import *tool*; loading it with real data needs a file sourced from EC Nepal/NSO)
- ✅ **Module 06 — Voter engagement** (`Voter.supportLevel` + `VoterContact` history log) — see
  the addendum in `docs/modules/02-households-voters.md`. Org-defined issue tags were scoped for
  the same original pass and remain deferred.
- ✅ **Module 07 — Reporting & Analytics** (`GET /reports/dashboard`) — see
  `docs/modules/07-reporting-analytics.md`
- ✅ **Module 08 — Household Map UI** (`GET /map`) — see `docs/modules/08-household-map-ui.md`.
  The first (and so far only) browser UI in this repo — a plain static page served by this same
  Express app, not a separate frontend project; it's just a client of the API above.
- ✅ **Module 09 — Household Family Tree** (house owner + spouse/children/grandchildren,
  matched against the voter list) — see `docs/modules/09-household-family-tree.md`
- ⏳ Next: issue tags, or address-matched import (deferred from Module 03) — whichever the
  campaign needs first
