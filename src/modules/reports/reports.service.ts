import {
  ContactMethod,
  ContactOutcome,
  Gender,
  Prisma,
  TaskStatus,
  UserRole,
  VisitOutcome,
  VoterStatus,
  VoterSupportLevel,
} from '@prisma/client';
import { prisma } from '../../config/db';
import { ApiError } from '../../utils/ApiError';
import { GeoScope, getAccessibleGeoScope } from '../../middleware/geoScope';

interface ActingUser {
  id: string;
  organizationId: string;
  role: UserRole;
}

interface DashboardQuery {
  wardId?: string;
  toleId?: string;
}

// Same "OR-filter for the caller's own scope, AND the explicit query filter"
// shape households.service.ts/voters.service.ts already use for list
// endpoints — an out-of-scope wardId/toleId query naturally yields all-zero
// counts rather than needing a separate assertGeoScopeAccess call/403.
function householdWhere(actor: ActingUser, scope: GeoScope | null, query: DashboardQuery): Prisma.HouseholdWhereInput {
  return {
    organizationId: actor.organizationId,
    deletedAt: null,
    ...(scope ? { OR: [{ wardId: { in: scope.wardIds } }, { toleId: { in: scope.toleIds } }] } : {}),
    ...(query.wardId ? { wardId: query.wardId } : {}),
    ...(query.toleId ? { toleId: query.toleId } : {}),
  };
}

function voterWhere(actor: ActingUser, scope: GeoScope | null, query: DashboardQuery): Prisma.VoterWhereInput {
  return {
    organizationId: actor.organizationId,
    deletedAt: null,
    ...(scope ? { OR: [{ wardId: { in: scope.wardIds } }, { toleId: { in: scope.toleIds } }] } : {}),
    ...(query.wardId ? { wardId: query.wardId } : {}),
    ...(query.toleId ? { toleId: query.toleId } : {}),
  };
}

function taskWhere(actor: ActingUser, scope: GeoScope | null, query: DashboardQuery): Prisma.CanvassingTaskWhereInput {
  return {
    organizationId: actor.organizationId,
    deletedAt: null,
    ...(scope ? { OR: [{ wardId: { in: scope.wardIds } }, { toleId: { in: scope.toleIds } }] } : {}),
    ...(query.wardId ? { wardId: query.wardId } : {}),
    ...(query.toleId ? { toleId: query.toleId } : {}),
  };
}

// CanvassingVisit/VoterContact have no ward/tole columns of their own —
// scoped through their parent task/voter instead.
function visitWhere(actor: ActingUser, scope: GeoScope | null, query: DashboardQuery): Prisma.CanvassingVisitWhereInput {
  return { task: taskWhere(actor, scope, query) };
}

function contactWhere(actor: ActingUser, scope: GeoScope | null, query: DashboardQuery): Prisma.VoterContactWhereInput {
  return { voter: voterWhere(actor, scope, query) };
}

// Turns a Prisma groupBy result into a zero-filled record over every enum
// value plus an "UNSET" bucket for a null group key (only ever populated for
// nullable columns like Voter.gender — harmless, always-zero noise for
// non-nullable ones). Internal to this module; not meant to be a general
// abstraction elsewhere.
function fillEnumCounts<T extends string>(
  rows: (Record<string, unknown> & { _count: { _all: number } })[],
  key: string,
  allValues: readonly T[],
): Record<T | 'UNSET', number> {
  const result = Object.fromEntries([...allValues, 'UNSET' as const].map((v) => [v, 0])) as Record<
    T | 'UNSET',
    number
  >;
  for (const row of rows) {
    const raw = row[key];
    const bucket = (raw === null || raw === undefined ? 'UNSET' : (raw as T)) as T | 'UNSET';
    result[bucket] = (result[bucket] ?? 0) + row._count._all;
  }
  return result;
}

export async function getDashboard(actor: ActingUser, query: DashboardQuery) {
  if (query.wardId) {
    const ward = await prisma.ward.findUnique({ where: { id: query.wardId } });
    if (!ward) throw ApiError.badRequest('Ward not found');
  }
  if (query.toleId) {
    const tole = await prisma.tole.findUnique({ where: { id: query.toleId } });
    if (!tole || tole.organizationId !== actor.organizationId) {
      throw ApiError.badRequest('Tole not found in your organization');
    }
  }

  const scope = await getAccessibleGeoScope(actor);
  const hWhere = householdWhere(actor, scope, query);
  const vWhere = voterWhere(actor, scope, query);
  const tWhere = taskWhere(actor, scope, query);
  const visWhere = visitWhere(actor, scope, query);
  const cWhere = contactWhere(actor, scope, query);

  const [
    householdsTotal,
    householdsWithCoordinates,
    votersTotal,
    voterStatusRows,
    voterGenderRows,
    voterSupportRows,
    tasksTotal,
    taskStatusRows,
    visitsTotal,
    visitOutcomeRows,
    contactsTotal,
    contactMethodRows,
    contactOutcomeRows,
  ] = await Promise.all([
    prisma.household.count({ where: hWhere }),
    prisma.household.count({ where: { ...hWhere, centerLat: { not: null }, centerLng: { not: null } } }),
    prisma.voter.count({ where: vWhere }),
    prisma.voter.groupBy({ by: ['status'], where: vWhere, _count: { _all: true } }),
    prisma.voter.groupBy({ by: ['gender'], where: vWhere, _count: { _all: true } }),
    prisma.voter.groupBy({ by: ['supportLevel'], where: vWhere, _count: { _all: true } }),
    prisma.canvassingTask.count({ where: tWhere }),
    prisma.canvassingTask.groupBy({ by: ['status'], where: tWhere, _count: { _all: true } }),
    prisma.canvassingVisit.count({ where: visWhere }),
    prisma.canvassingVisit.groupBy({ by: ['outcome'], where: visWhere, _count: { _all: true } }),
    prisma.voterContact.count({ where: cWhere }),
    prisma.voterContact.groupBy({ by: ['method'], where: cWhere, _count: { _all: true } }),
    prisma.voterContact.groupBy({ by: ['outcome'], where: cWhere, _count: { _all: true } }),
  ]);

  return {
    scope: {
      organizationId: actor.organizationId,
      wardId: query.wardId ?? null,
      toleId: query.toleId ?? null,
    },
    households: {
      total: householdsTotal,
      withCoordinates: householdsWithCoordinates,
    },
    voters: {
      total: votersTotal,
      byStatus: fillEnumCounts(voterStatusRows, 'status', Object.values(VoterStatus)),
      byGender: fillEnumCounts(voterGenderRows, 'gender', Object.values(Gender)),
      bySupportLevel: fillEnumCounts(voterSupportRows, 'supportLevel', Object.values(VoterSupportLevel)),
    },
    canvassing: {
      tasks: {
        total: tasksTotal,
        byStatus: fillEnumCounts(taskStatusRows, 'status', Object.values(TaskStatus)),
      },
      visits: {
        total: visitsTotal,
        byOutcome: fillEnumCounts(visitOutcomeRows, 'outcome', Object.values(VisitOutcome)),
      },
    },
    contacts: {
      total: contactsTotal,
      byMethod: fillEnumCounts(contactMethodRows, 'method', Object.values(ContactMethod)),
      byOutcome: fillEnumCounts(contactOutcomeRows, 'outcome', Object.values(ContactOutcome)),
    },
  };
}
