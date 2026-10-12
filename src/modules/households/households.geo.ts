import { Prisma } from '@prisma/client';
import { prisma } from '../../config/db';
import { ApiError } from '../../utils/ApiError';
import { PaginationQuery, toSkipTake } from '../../utils/pagination';
import { GeoScope, geoScopeSqlCondition } from '../../middleware/geoScope';

// Spatial queries and the geometry-sync helper for Household. Split out from
// households.service.ts because these all go through $queryRaw/$executeRaw —
// Prisma Client cannot select, filter, or write an Unsupported column (the
// `location` geometry(Point,4326) column added in the Household GIS module)
// through its normal query builder. See docs/modules/03-household-gis.md.

type SyncableClient = Pick<typeof prisma, '$executeRaw'>;

// Called after every Household create/update (inside the same transaction)
// with the row's *final* centerLat/centerLng, so `location` never drifts from
// them. Always runs — simpler and cheap enough than trying to detect whether
// the coordinates actually changed.
export async function syncHouseholdLocation(
  tx: SyncableClient,
  id: string,
  centerLat: number | null,
  centerLng: number | null,
): Promise<void> {
  if (centerLat == null || centerLng == null) {
    await tx.$executeRaw`UPDATE households SET location = NULL WHERE id = ${id}`;
    return;
  }
  await tx.$executeRaw`
    UPDATE households
    SET location = ST_SetSRID(ST_MakePoint(${centerLng}, ${centerLat}), 4326)
    WHERE id = ${id}
  `;
}

interface HouseholdGeoRow {
  id: string;
  organizationId: string;
  wardId: string;
  toleId: string | null;
  address: string;
  landmark: string | null;
  centerLat: number | null;
  centerLng: number | null;
  createdAt: Date;
  updatedAt: Date;
}

const HOUSEHOLD_SELECT_SQL = Prisma.sql`
  id, organization_id AS "organizationId", ward_id AS "wardId", tole_id AS "toleId",
  address, landmark, center_lat AS "centerLat", center_lng AS "centerLng",
  created_at AS "createdAt", updated_at AS "updatedAt"
`;

export const NEARBY_MAX_RADIUS_METERS = 5000;

interface FindNearbyInput extends PaginationQuery {
  organizationId: string;
  scope: GeoScope | null;
  lat: number;
  lng: number;
  radiusMeters: number;
  wardId?: string;
}

export async function findNearbyHouseholds(input: FindNearbyInput) {
  const { skip, take } = toSkipTake(input);
  const scopeCondition = geoScopeSqlCondition(input.scope);

  const where = Prisma.sql`
    organization_id = ${input.organizationId}
    AND deleted_at IS NULL
    AND location IS NOT NULL
    AND ST_DWithin(
      location::geography,
      ST_SetSRID(ST_MakePoint(${input.lng}, ${input.lat}), 4326)::geography,
      ${input.radiusMeters}
    )
    ${input.wardId ? Prisma.sql`AND ward_id = ${input.wardId}` : Prisma.empty}
    AND ${scopeCondition}
  `;

  const [items, countResult] = await Promise.all([
    prisma.$queryRaw<(HouseholdGeoRow & { distanceMeters: number })[]>`
      SELECT ${HOUSEHOLD_SELECT_SQL},
        ST_Distance(
          location::geography,
          ST_SetSRID(ST_MakePoint(${input.lng}, ${input.lat}), 4326)::geography
        ) AS "distanceMeters"
      FROM households
      WHERE ${where}
      ORDER BY "distanceMeters" ASC
      LIMIT ${take} OFFSET ${skip}
    `,
    prisma.$queryRaw<{ count: bigint }[]>`SELECT COUNT(*)::bigint AS count FROM households WHERE ${where}`,
  ]);

  return { items, totalItems: Number(countResult[0]?.count ?? 0) };
}

interface FindWithinPolygonInput extends PaginationQuery {
  organizationId: string;
  scope: GeoScope | null;
  wardId: string;
  polygon: object;
}

export async function findHouseholdsWithinPolygon(input: FindWithinPolygonInput) {
  const { skip, take } = toSkipTake(input);
  const scopeCondition = geoScopeSqlCondition(input.scope);
  const polygonGeoJson = JSON.stringify(input.polygon);

  const where = Prisma.sql`
    organization_id = ${input.organizationId}
    AND deleted_at IS NULL
    AND ward_id = ${input.wardId}
    AND location IS NOT NULL
    AND ST_Contains(ST_SetSRID(ST_GeomFromGeoJSON(${polygonGeoJson}), 4326), location)
    AND ${scopeCondition}
  `;

  try {
    const [items, countResult] = await Promise.all([
      prisma.$queryRaw<HouseholdGeoRow[]>`
        SELECT ${HOUSEHOLD_SELECT_SQL}
        FROM households
        WHERE ${where}
        ORDER BY created_at DESC
        LIMIT ${take} OFFSET ${skip}
      `,
      prisma.$queryRaw<{ count: bigint }[]>`SELECT COUNT(*)::bigint AS count FROM households WHERE ${where}`,
    ]);

    return { items, totalItems: Number(countResult[0]?.count ?? 0) };
  } catch (err) {
    throw ApiError.badRequest(`Invalid polygon geometry: ${(err as Error).message}`);
  }
}

// Households assigned to `toleId` (via the plain toleId foreign key) whose
// actual point location falls outside that tole's drawn boundary polygon —
// a data-quality report, not a list of "households in this tole" (which is
// already `GET /households?toleId=...`). Surfaces geocoding mistakes and
// stale tole assignments after a boundary is drawn or redrawn.
export async function findToleBoundaryMismatches(toleId: string): Promise<HouseholdGeoRow[]> {
  return prisma.$queryRaw<HouseholdGeoRow[]>`
    SELECT ${HOUSEHOLD_SELECT_SQL}
    FROM households h
    WHERE h.tole_id = ${toleId}
      AND h.deleted_at IS NULL
      AND h.location IS NOT NULL
      AND NOT ST_Contains((SELECT boundary_geom FROM toles WHERE id = ${toleId}), h.location)
  `;
}
