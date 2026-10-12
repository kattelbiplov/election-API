import { Prisma, UserRole } from '@prisma/client';
import { prisma } from '../../config/db';
import { ApiError } from '../../utils/ApiError';
import { PaginationQuery, toSkipTake } from '../../utils/pagination';
import { assertGeoScopeAccess, getAccessibleGeoScope } from '../../middleware/geoScope';
import * as householdsGeo from './households.geo';
import { buildFamilyTree } from './households.familyTree';

interface ActingUser {
  id: string;
  organizationId: string;
  role: UserRole;
}

// Confirms `toleId` (if given) exists, belongs to the actor's organization,
// and sits under `wardId` — same check users.service.ts's assignGeo() does
// for UserGeoAssignment. Returns nothing; throws on any mismatch.
async function assertToleBelongsToWard(actor: ActingUser, wardId: string, toleId?: string): Promise<void> {
  if (!toleId) return;
  const tole = await prisma.tole.findUnique({ where: { id: toleId } });
  if (!tole || tole.organizationId !== actor.organizationId) {
    throw ApiError.badRequest('Tole not found in your organization');
  }
  if (tole.wardId !== wardId) {
    throw ApiError.badRequest('Tole does not belong to the given ward');
  }
}

interface CreateHouseholdInput {
  wardId: string;
  toleId?: string;
  address: string;
  landmark?: string;
  centerLat?: number;
  centerLng?: number;
}

export async function createHousehold(actor: ActingUser, input: CreateHouseholdInput) {
  const ward = await prisma.ward.findUnique({ where: { id: input.wardId } });
  if (!ward) throw ApiError.badRequest('Ward not found');

  await assertToleBelongsToWard(actor, input.wardId, input.toleId);
  await assertGeoScopeAccess(actor, { wardId: input.wardId, toleId: input.toleId });

  return prisma.$transaction(async (tx) => {
    const household = await tx.household.create({
      data: {
        organizationId: actor.organizationId,
        wardId: input.wardId,
        toleId: input.toleId,
        address: input.address,
        landmark: input.landmark,
        centerLat: input.centerLat,
        centerLng: input.centerLng,
        createdById: actor.id,
      },
    });
    await householdsGeo.syncHouseholdLocation(tx, household.id, household.centerLat, household.centerLng);
    return household;
  });
}

interface ListHouseholdsQuery extends PaginationQuery {
  wardId?: string;
  toleId?: string;
  search?: string;
}

export async function listHouseholds(actor: ActingUser, query: ListHouseholdsQuery) {
  const scope = await getAccessibleGeoScope(actor);

  const where: Prisma.HouseholdWhereInput = {
    organizationId: actor.organizationId,
    deletedAt: null,
    ...(scope ? { OR: [{ wardId: { in: scope.wardIds } }, { toleId: { in: scope.toleIds } }] } : {}),
    ...(query.wardId ? { wardId: query.wardId } : {}),
    ...(query.toleId ? { toleId: query.toleId } : {}),
    ...(query.search ? { address: { contains: query.search, mode: 'insensitive' } } : {}),
  };

  const [items, totalItems] = await Promise.all([
    prisma.household.findMany({ where, orderBy: { createdAt: 'desc' }, ...toSkipTake(query) }),
    prisma.household.count({ where }),
  ]);

  return { items, totalItems };
}

export async function getHouseholdById(actor: ActingUser, id: string) {
  const household = await prisma.household.findFirst({
    where: { id, organizationId: actor.organizationId, deletedAt: null },
    include: { ward: true, tole: true },
  });
  if (!household) throw ApiError.notFound('Household not found');
  await assertGeoScopeAccess(actor, { wardId: household.wardId, toleId: household.toleId });
  return household;
}

interface UpdateHouseholdInput {
  toleId?: string | null;
  address?: string;
  landmark?: string | null;
  centerLat?: number | null;
  centerLng?: number | null;
  headOfHouseholdId?: string | null;
}

export async function updateHousehold(actor: ActingUser, id: string, input: UpdateHouseholdInput) {
  const household = await getHouseholdById(actor, id);

  if (input.toleId) {
    await assertToleBelongsToWard(actor, household.wardId, input.toleId);
    await assertGeoScopeAccess(actor, { wardId: household.wardId, toleId: input.toleId });
  }

  if (input.headOfHouseholdId) {
    const voter = await prisma.voter.findUnique({ where: { id: input.headOfHouseholdId } });
    if (!voter || voter.organizationId !== actor.organizationId || voter.deletedAt) {
      throw ApiError.badRequest('Voter not found in your organization');
    }
    if (voter.householdId !== id) {
      throw ApiError.badRequest(
        'This voter is not linked to this household — set their householdId to this household first',
      );
    }
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.household.update({
      where: { id },
      data: input as Prisma.HouseholdUpdateInput,
    });
    if (input.centerLat !== undefined || input.centerLng !== undefined) {
      await householdsGeo.syncHouseholdLocation(tx, updated.id, updated.centerLat, updated.centerLng);
    }
    return updated;
  });
}

export async function deleteHousehold(actor: ActingUser, id: string): Promise<void> {
  const household = await getHouseholdById(actor, id);
  await prisma.household.update({ where: { id: household.id }, data: { deletedAt: new Date() } });
}

// ============================= GIS (Module 03) =============================

interface FindNearbyHouseholdsQuery extends PaginationQuery {
  lat: number;
  lng: number;
  radiusMeters: number;
  wardId?: string;
}

export async function findNearbyHouseholds(actor: ActingUser, query: FindNearbyHouseholdsQuery) {
  if (query.wardId) {
    const ward = await prisma.ward.findUnique({ where: { id: query.wardId } });
    if (!ward) throw ApiError.badRequest('Ward not found');
    await assertGeoScopeAccess(actor, { wardId: query.wardId });
  }

  const scope = await getAccessibleGeoScope(actor);
  return householdsGeo.findNearbyHouseholds({
    ...query,
    organizationId: actor.organizationId,
    scope,
  });
}

interface FindWithinPolygonInput {
  wardId: string;
  polygon: object;
  page: number;
  pageSize: number;
}

export async function findHouseholdsWithinPolygon(actor: ActingUser, input: FindWithinPolygonInput) {
  const ward = await prisma.ward.findUnique({ where: { id: input.wardId } });
  if (!ward) throw ApiError.badRequest('Ward not found');
  await assertGeoScopeAccess(actor, { wardId: input.wardId });

  const scope = await getAccessibleGeoScope(actor);
  return householdsGeo.findHouseholdsWithinPolygon({
    ...input,
    organizationId: actor.organizationId,
    scope,
  });
}

// ============================= Family tree (Module 09) =============================

export async function getFamilyTree(actor: ActingUser, id: string) {
  const household = await getHouseholdById(actor, id); // authorizes + 404s
  return buildFamilyTree(household.headOfHouseholdId);
}
