import { prisma } from '../../config/db';
import { ApiError } from '../../utils/ApiError';
import { findToleBoundaryMismatches } from '../households/households.geo';

// Tole-side half of the Household GIS module: keeps `toles.boundary_geom`
// (a real PostGIS polygon) in sync with `boundary` (the plain GeoJSON column
// the API reads/writes) and exposes the boundary-mismatch report. Split out
// from geo.service.ts for the same reason households.geo.ts is split from
// households.service.ts — this is all raw SQL against an Unsupported column.

type SyncableClient = Pick<typeof prisma, '$executeRaw'>;

// Called after every Tole create/update (inside the same transaction) with
// the row's *final* boundary GeoJSON. Always runs, mirroring
// households.geo.ts's syncHouseholdLocation.
export async function syncToleBoundaryGeom(tx: SyncableClient, id: string, boundary: unknown): Promise<void> {
  if (!boundary) {
    await tx.$executeRaw`UPDATE toles SET boundary_geom = NULL WHERE id = ${id}`;
    return;
  }

  try {
    await tx.$executeRaw`
      UPDATE toles
      SET boundary_geom = ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(boundary)}), 4326)
      WHERE id = ${id}
    `;
  } catch (err) {
    throw ApiError.badRequest(`Invalid boundary polygon: ${(err as Error).message}`);
  }
}

export async function getToleBoundaryCheck(toleId: string) {
  const hasBoundary = await prisma.$queryRaw<{ hasBoundary: boolean }[]>`
    SELECT (boundary_geom IS NOT NULL) AS "hasBoundary" FROM toles WHERE id = ${toleId}
  `;
  if (!hasBoundary[0]?.hasBoundary) {
    throw ApiError.badRequest('This tole has no boundary polygon defined yet');
  }

  return findToleBoundaryMismatches(toleId);
}
