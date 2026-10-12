import { Prisma, UserRole } from '@prisma/client';
import { prisma } from '../../config/db';
import { ApiError } from '../../utils/ApiError';
import { PaginationQuery, toSkipTake } from '../../utils/pagination';
import { assertGeoScopeAccess, assertWardAccess } from '../../middleware/geoScope';
import { getToleBoundaryCheck, syncToleBoundaryGeom } from './geo.geometry';
import { parseImportFile } from '../../utils/fileImport';
import { GEO_IMPORT_MAX_ROWS, validateImportRow } from './geo.import';

interface ActingUser {
  id: string;
  organizationId: string;
  role: UserRole;
}

// ============================= Province =============================

export async function createProvince(data: Prisma.ProvinceCreateInput) {
  const existing = await prisma.province.findUnique({ where: { code: data.code } });
  if (existing) throw ApiError.conflict('A province with this code already exists');
  return prisma.province.create({ data });
}

export async function listProvinces() {
  return prisma.province.findMany({ orderBy: { code: 'asc' } });
}

export async function getProvinceById(id: string) {
  const province = await prisma.province.findUnique({ where: { id } });
  if (!province) throw ApiError.notFound('Province not found');
  return province;
}

export async function updateProvince(id: string, data: Prisma.ProvinceUpdateInput) {
  await getProvinceById(id);
  return prisma.province.update({ where: { id }, data });
}

// ============================= District =============================

export async function createDistrict(data: {
  provinceId: string;
  code: string;
  name: string;
  nameNepali?: string;
}) {
  await getProvinceById(data.provinceId);
  const existing = await prisma.district.findUnique({
    where: { provinceId_code: { provinceId: data.provinceId, code: data.code } },
  });
  if (existing) throw ApiError.conflict('A district with this code already exists in this province');
  return prisma.district.create({ data });
}

export async function listDistricts(query: PaginationQuery & { provinceId?: string }) {
  const where: Prisma.DistrictWhereInput = query.provinceId ? { provinceId: query.provinceId } : {};
  const [items, totalItems] = await Promise.all([
    prisma.district.findMany({ where, orderBy: { name: 'asc' }, ...toSkipTake(query) }),
    prisma.district.count({ where }),
  ]);
  return { items, totalItems };
}

export async function getDistrictById(id: string) {
  const district = await prisma.district.findUnique({ where: { id } });
  if (!district) throw ApiError.notFound('District not found');
  return district;
}

export async function updateDistrict(id: string, data: Prisma.DistrictUpdateInput) {
  await getDistrictById(id);
  return prisma.district.update({ where: { id }, data });
}

// ============================= Municipality =============================

export async function createMunicipality(data: {
  districtId: string;
  code: string;
  name: string;
  nameNepali?: string;
  type: Prisma.MunicipalityCreateInput['type'];
  totalWards: number;
}) {
  await getDistrictById(data.districtId);
  const existing = await prisma.municipality.findUnique({
    where: { districtId_code: { districtId: data.districtId, code: data.code } },
  });
  if (existing) throw ApiError.conflict('A municipality with this code already exists in this district');
  return prisma.municipality.create({ data });
}

export async function listMunicipalities(
  query: PaginationQuery & { districtId?: string; search?: string },
) {
  const where: Prisma.MunicipalityWhereInput = {
    ...(query.districtId ? { districtId: query.districtId } : {}),
    ...(query.search ? { name: { contains: query.search, mode: 'insensitive' } } : {}),
  };
  const [items, totalItems] = await Promise.all([
    prisma.municipality.findMany({ where, orderBy: { name: 'asc' }, ...toSkipTake(query) }),
    prisma.municipality.count({ where }),
  ]);
  return { items, totalItems };
}

export async function getMunicipalityById(id: string) {
  const municipality = await prisma.municipality.findUnique({ where: { id } });
  if (!municipality) throw ApiError.notFound('Municipality not found');
  return municipality;
}

export async function updateMunicipality(id: string, data: Prisma.MunicipalityUpdateInput) {
  await getMunicipalityById(id);
  return prisma.municipality.update({ where: { id }, data });
}

// ============================= Ward =============================

export async function createWard(data: { municipalityId: string; wardNumber: number; name?: string; population?: number }) {
  const municipality = await getMunicipalityById(data.municipalityId);
  if (data.wardNumber > municipality.totalWards) {
    throw ApiError.badRequest(
      `Ward number ${data.wardNumber} exceeds ${municipality.name}'s total of ${municipality.totalWards} wards`,
    );
  }
  const existing = await prisma.ward.findUnique({
    where: { municipalityId_wardNumber: { municipalityId: data.municipalityId, wardNumber: data.wardNumber } },
  });
  if (existing) throw ApiError.conflict('This ward already exists for this municipality');
  return prisma.ward.create({ data });
}

export async function listWards(query: PaginationQuery & { municipalityId?: string }) {
  const where: Prisma.WardWhereInput = query.municipalityId ? { municipalityId: query.municipalityId } : {};
  const [items, totalItems] = await Promise.all([
    prisma.ward.findMany({
      where,
      orderBy: [{ municipalityId: 'asc' }, { wardNumber: 'asc' }],
      ...toSkipTake(query),
    }),
    prisma.ward.count({ where }),
  ]);
  return { items, totalItems };
}

export async function getWardById(id: string) {
  const ward = await prisma.ward.findUnique({ where: { id }, include: { municipality: true } });
  if (!ward) throw ApiError.notFound('Ward not found');
  return ward;
}

export async function updateWard(actor: ActingUser, id: string, data: Prisma.WardUpdateInput) {
  await getWardById(id);
  await assertWardAccess(actor, id);
  return prisma.ward.update({ where: { id }, data });
}

// ============================= Tole =============================

export async function createTole(
  actor: ActingUser,
  data: { wardId: string; name: string; nameNepali?: string; centerLat?: number; centerLng?: number; boundary?: object },
) {
  await getWardById(data.wardId);
  await assertWardAccess(actor, data.wardId);

  const existing = await prisma.tole.findFirst({
    where: { organizationId: actor.organizationId, wardId: data.wardId, name: data.name, deletedAt: null },
  });
  if (existing) throw ApiError.conflict('A tole with this name already exists in this ward');

  return prisma.$transaction(async (tx) => {
    const tole = await tx.tole.create({
      data: {
        organizationId: actor.organizationId,
        wardId: data.wardId,
        name: data.name,
        nameNepali: data.nameNepali,
        centerLat: data.centerLat,
        centerLng: data.centerLng,
        boundary: data.boundary as Prisma.InputJsonValue | undefined,
        createdById: actor.id,
      },
    });
    await syncToleBoundaryGeom(tx, tole.id, tole.boundary);
    return tole;
  });
}

export async function listToles(
  actor: ActingUser,
  query: PaginationQuery & { wardId?: string; search?: string },
) {
  const where: Prisma.ToleWhereInput = {
    organizationId: actor.organizationId,
    deletedAt: null,
    ...(query.wardId ? { wardId: query.wardId } : {}),
    ...(query.search ? { name: { contains: query.search, mode: 'insensitive' } } : {}),
  };
  const [items, totalItems] = await Promise.all([
    prisma.tole.findMany({ where, orderBy: { name: 'asc' }, ...toSkipTake(query) }),
    prisma.tole.count({ where }),
  ]);
  return { items, totalItems };
}

export async function getToleById(actor: ActingUser, id: string) {
  const tole = await prisma.tole.findFirst({
    where: { id, organizationId: actor.organizationId, deletedAt: null },
    include: { ward: { include: { municipality: true } } },
  });
  if (!tole) throw ApiError.notFound('Tole not found');
  return tole;
}

export async function updateTole(
  actor: ActingUser,
  id: string,
  data: Partial<{ name: string; nameNepali: string | null; centerLat: number | null; centerLng: number | null; boundary: object | null }>,
) {
  const tole = await getToleById(actor, id);
  await assertWardAccess(actor, tole.wardId);
  return prisma.$transaction(async (tx) => {
    const updated = await tx.tole.update({
      where: { id },
      data: data as Prisma.ToleUpdateInput,
    });
    if (data.boundary !== undefined) {
      await syncToleBoundaryGeom(tx, updated.id, updated.boundary);
    }
    return updated;
  });
}

export async function deleteTole(actor: ActingUser, id: string) {
  const tole = await getToleById(actor, id);
  await assertWardAccess(actor, tole.wardId);
  await prisma.tole.update({ where: { id }, data: { deletedAt: new Date() } });
}

// Households assigned to this tole whose actual point location falls outside
// its drawn boundary — see docs/modules/03-household-gis.md. Gated on
// household:read (not geo:read) at the route level, and scoped tighter than
// a plain ward check, because the result is household PII, not tole metadata.
export async function checkToleBoundary(actor: ActingUser, id: string) {
  const tole = await getToleById(actor, id); // 404s + org-scopes
  await assertGeoScopeAccess(actor, { wardId: tole.wardId, toleId: tole.id });
  return getToleBoundaryCheck(id);
}

// ============================= Geo dataset import =============================
// See docs/modules/05-geo-dataset-import.md. Route-gated on
// geo:manage_national (SUPER_ADMIN only) — this is global reference data, not
// org-scoped, so there's no `actor` geo-scoping to check here the way every
// other import in this codebase has.

interface GeoImportFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
}

interface GeoImportSummary {
  totalRows: number;
  provincesCreated: number;
  provincesUpdated: number;
  districtsCreated: number;
  districtsUpdated: number;
  municipalitiesCreated: number;
  municipalitiesUpdated: number;
  wardsCreated: number;
  errorRows: number;
  issues: { rowNumber: number; message: string }[];
}

export async function importGeoDataset(file: GeoImportFile): Promise<GeoImportSummary> {
  const rawRows = await parseImportFile(file.buffer, file.originalname, file.mimetype);
  if (rawRows.length === 0) {
    throw ApiError.badRequest('File contains no data rows');
  }
  if (rawRows.length > GEO_IMPORT_MAX_ROWS) {
    throw ApiError.badRequest(
      `File has ${rawRows.length} rows, which exceeds the ${GEO_IMPORT_MAX_ROWS}-row limit`,
    );
  }

  const provinceCache = new Map<number, string>();
  const districtCache = new Map<string, string>();
  const municipalityCache = new Map<string, string>();

  const summary: GeoImportSummary = {
    totalRows: rawRows.length,
    provincesCreated: 0,
    provincesUpdated: 0,
    districtsCreated: 0,
    districtsUpdated: 0,
    municipalitiesCreated: 0,
    municipalitiesUpdated: 0,
    wardsCreated: 0,
    errorRows: 0,
    issues: [],
  };

  for (let i = 0; i < rawRows.length; i++) {
    const rowNumber = i + 1;
    const result = validateImportRow(rawRows[i]);

    if ('error' in result) {
      summary.errorRows++;
      summary.issues.push({ rowNumber, message: result.error });
      continue;
    }

    const row = result.data;

    try {
      // --- Province ---
      let provinceId = provinceCache.get(row.provinceCode);
      if (!provinceId) {
        const existing = await prisma.province.findUnique({ where: { code: row.provinceCode } });
        if (existing) {
          if (existing.name !== row.provinceName || existing.nameNepali !== (row.provinceNameNepali ?? null)) {
            await prisma.province.update({
              where: { id: existing.id },
              data: { name: row.provinceName, nameNepali: row.provinceNameNepali },
            });
            summary.provincesUpdated++;
          }
          provinceId = existing.id;
        } else {
          const created = await prisma.province.create({
            data: { code: row.provinceCode, name: row.provinceName, nameNepali: row.provinceNameNepali },
          });
          provinceId = created.id;
          summary.provincesCreated++;
        }
        provinceCache.set(row.provinceCode, provinceId);
      }

      // --- District ---
      const districtKey = `${provinceId}:${row.districtCode}`;
      let districtId = districtCache.get(districtKey);
      if (!districtId) {
        const existing = await prisma.district.findUnique({
          where: { provinceId_code: { provinceId, code: row.districtCode } },
        });
        if (existing) {
          if (existing.name !== row.districtName || existing.nameNepali !== (row.districtNameNepali ?? null)) {
            await prisma.district.update({
              where: { id: existing.id },
              data: { name: row.districtName, nameNepali: row.districtNameNepali },
            });
            summary.districtsUpdated++;
          }
          districtId = existing.id;
        } else {
          const created = await prisma.district.create({
            data: {
              provinceId,
              code: row.districtCode,
              name: row.districtName,
              nameNepali: row.districtNameNepali,
            },
          });
          districtId = created.id;
          summary.districtsCreated++;
        }
        districtCache.set(districtKey, districtId);
      }

      // --- Municipality (+ its wards) ---
      const municipalityKey = `${districtId}:${row.municipalityCode}`;
      if (!municipalityCache.has(municipalityKey)) {
        const existing = await prisma.municipality.findUnique({
          where: { districtId_code: { districtId, code: row.municipalityCode } },
        });

        let municipalityId: string;
        let effectiveTotalWards = row.totalWards;

        if (existing) {
          if (
            existing.name !== row.municipalityName ||
            existing.nameNepali !== (row.municipalityNameNepali ?? null) ||
            existing.type !== row.municipalityType ||
            existing.totalWards !== row.totalWards
          ) {
            await prisma.municipality.update({
              where: { id: existing.id },
              data: {
                name: row.municipalityName,
                nameNepali: row.municipalityNameNepali,
                type: row.municipalityType,
                totalWards: row.totalWards,
              },
            });
            summary.municipalitiesUpdated++;
          }
          municipalityId = existing.id;
          // Never shrink ward creation below what already exists on re-import.
          effectiveTotalWards = Math.max(existing.totalWards, row.totalWards);
        } else {
          const created = await prisma.municipality.create({
            data: {
              districtId,
              code: row.municipalityCode,
              name: row.municipalityName,
              nameNepali: row.municipalityNameNepali,
              type: row.municipalityType,
              totalWards: row.totalWards,
            },
          });
          municipalityId = created.id;
          summary.municipalitiesCreated++;
        }
        municipalityCache.set(municipalityKey, municipalityId);

        // Create any missing ward numbers 1..effectiveTotalWards — existing
        // wards (which may already carry UserGeoAssignments/households) are
        // never touched or deleted, even if a re-import lowers total_wards.
        const existingWards = await prisma.ward.findMany({
          where: { municipalityId },
          select: { wardNumber: true },
        });
        const existingNumbers = new Set(existingWards.map((w) => w.wardNumber));
        const wardsToCreate = [];
        for (let w = 1; w <= effectiveTotalWards; w++) {
          if (!existingNumbers.has(w)) wardsToCreate.push({ municipalityId, wardNumber: w });
        }
        if (wardsToCreate.length > 0) {
          await prisma.ward.createMany({ data: wardsToCreate });
          summary.wardsCreated += wardsToCreate.length;
        }
      }
    } catch (err) {
      summary.errorRows++;
      summary.issues.push({ rowNumber, message: `Unexpected error while saving row: ${(err as Error).message}` });
    }
  }

  return summary;
}
