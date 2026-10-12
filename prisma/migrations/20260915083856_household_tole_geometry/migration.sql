-- Enable PostGIS before adding geometry columns. seed.ts also does this, but
-- migrations must not depend on the seed script having run first (e.g. a
-- fresh `prisma migrate deploy` in a new environment) — idempotent either way.
CREATE EXTENSION IF NOT EXISTS postgis;

-- AlterTable
ALTER TABLE "households" ADD COLUMN     "location" geometry(Point, 4326);

-- AlterTable
ALTER TABLE "toles" ADD COLUMN     "boundary_geom" geometry(Polygon, 4326);

-- Spatial indexes: GiST is what makes ST_DWithin/ST_Contains queries fast
-- instead of a full table scan. Prisma's schema language has no way to
-- express an index type, so these are hand-added here.
CREATE INDEX "households_location_idx" ON "households" USING GIST ("location");
CREATE INDEX "toles_boundary_geom_idx" ON "toles" USING GIST ("boundary_geom");
