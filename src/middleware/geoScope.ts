import { Prisma, UserRole } from '@prisma/client';
import { prisma } from '../config/db';
import { ApiError } from '../utils/ApiError';

interface ScopedUser {
  id: string;
  role: UserRole;
}

// Roles with no organization-wide geo access must have an explicit
// UserGeoAssignment row covering the ward/tole they're trying to touch.
const SCOPED_ROLES: UserRole[] = [
  UserRole.WARD_MANAGER,
  UserRole.TOLE_COORDINATOR,
  UserRole.FIELD_WORKER,
  UserRole.VOLUNTEER,
];

// Throws 403 if `user`'s role is scoped and they have no assignment reaching
// the given ward (and, if provided, tole). SUPER_ADMIN / CAMPAIGN_ADMIN /
// ANALYST / VIEW_ONLY are organization-wide and always pass.
export async function assertWardAccess(user: ScopedUser, wardId: string): Promise<void> {
  if (!SCOPED_ROLES.includes(user.role)) return;

  const assignment = await prisma.userGeoAssignment.findFirst({
    where: { userId: user.id, wardId },
    select: { id: true },
  });

  if (!assignment) {
    throw ApiError.forbidden('You are not assigned to this ward');
  }
}

export async function assertToleAccess(user: ScopedUser, toleId: string): Promise<void> {
  if (!SCOPED_ROLES.includes(user.role)) return;

  const assignment = await prisma.userGeoAssignment.findFirst({
    where: { userId: user.id, toleId },
    select: { id: true },
  });

  if (!assignment) {
    throw ApiError.forbidden('You are not assigned to this tole');
  }
}

// Returns the ward IDs a scoped user may act on, or `null` to mean
// "unrestricted" (organization-wide roles). Used to filter list endpoints.
export async function getAccessibleWardIds(user: ScopedUser): Promise<string[] | null> {
  if (!SCOPED_ROLES.includes(user.role)) return null;

  const assignments = await prisma.userGeoAssignment.findMany({
    where: { userId: user.id },
    select: { wardId: true },
    distinct: ['wardId'],
  });

  return assignments.map((a) => a.wardId);
}

export interface GeoScope {
  wardIds: string[]; // ward-level assignments (toleId null) — covers the whole ward
  toleIds: string[]; // tole-level assignments — covers just that tole
}

// Finer-grained version of getAccessibleWardIds for household/voter data:
// unlike the Geo module (province/district/.../tole are non-sensitive
// reference data, readable org-wide by everyone), households and voters carry
// real PII, so a TOLE_COORDINATOR/FIELD_WORKER assigned to one tole must not
// see the rest of the ward. Returns `null` for organization-wide roles.
export async function getAccessibleGeoScope(user: ScopedUser): Promise<GeoScope | null> {
  if (!SCOPED_ROLES.includes(user.role)) return null;

  const assignments = await prisma.userGeoAssignment.findMany({
    where: { userId: user.id },
    select: { wardId: true, toleId: true },
  });

  const wardIds = new Set<string>();
  const toleIds = new Set<string>();
  for (const a of assignments) {
    if (a.toleId) toleIds.add(a.toleId);
    else wardIds.add(a.wardId);
  }

  return { wardIds: [...wardIds], toleIds: [...toleIds] };
}

// Throws 403 unless a scoped user's assignments cover `target` — a tole-level
// assignment satisfies a matching toleId, a ward-level assignment satisfies
// any target in that ward (including one with no toleId at all). Unrestricted
// roles always pass. Use this (not assertWardAccess) wherever a resource can
// itself be tole-scoped, e.g. households/voters — assertWardAccess alone
// would let a TOLE_COORDINATOR assigned to one tole reach another tole's data
// in the same ward, because their UserGeoAssignment row also carries wardId.
export async function assertGeoScopeAccess(
  user: ScopedUser,
  target: { wardId: string; toleId?: string | null },
): Promise<void> {
  if (!SCOPED_ROLES.includes(user.role)) return;

  const scope = await getAccessibleGeoScope(user);
  if (!scope) return;
  if (target.toleId && scope.toleIds.includes(target.toleId)) return;
  if (scope.wardIds.includes(target.wardId)) return;

  throw ApiError.forbidden('You are not assigned to this ward/tole');
}

// Raw-SQL equivalent of the OR-filter getAccessibleGeoScope's callers build
// with Prisma's query builder — needed by the GIS spatial queries (households
// GIS module), which use $queryRaw because Prisma can't filter/select
// Unsupported geometry columns through the normal client API. `wardColumn`/
// `toleColumn` are fixed, internal-only identifiers (never user input), so
// splicing them in via Prisma.raw is safe.
export function geoScopeSqlCondition(
  scope: GeoScope | null,
  columns: { wardColumn: string; toleColumn: string } = { wardColumn: 'ward_id', toleColumn: 'tole_id' },
): Prisma.Sql {
  if (!scope) return Prisma.sql`TRUE`;

  const parts: Prisma.Sql[] = [];
  if (scope.wardIds.length > 0) {
    parts.push(
      Prisma.sql`${Prisma.raw(columns.wardColumn)} IN (${Prisma.join(scope.wardIds.map((id) => Prisma.sql`${id}`))})`,
    );
  }
  if (scope.toleIds.length > 0) {
    parts.push(
      Prisma.sql`${Prisma.raw(columns.toleColumn)} IN (${Prisma.join(scope.toleIds.map((id) => Prisma.sql`${id}`))})`,
    );
  }
  if (parts.length === 0) return Prisma.sql`FALSE`;

  return Prisma.sql`(${Prisma.join(parts, ' OR ')})`;
}
