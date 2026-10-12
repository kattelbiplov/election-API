import { Gender, Prisma, User, UserRole } from '@prisma/client';
import { prisma } from '../../config/db';
import { ApiError } from '../../utils/ApiError';
import { hashPassword } from '../../utils/password';
import { PaginationQuery, toSkipTake } from '../../utils/pagination';

interface ActingUser {
  id: string;
  organizationId: string;
  role: UserRole;
}

// Only SUPER_ADMIN may create/promote another SUPER_ADMIN — prevents a
// compromised or malicious CAMPAIGN_ADMIN from escalating themselves (or
// anyone else) to platform-operator level.
function assertCanAssignRole(actor: ActingUser, targetRole: UserRole): void {
  if (targetRole === UserRole.SUPER_ADMIN && actor.role !== UserRole.SUPER_ADMIN) {
    throw ApiError.forbidden('Only a super admin may grant the SUPER_ADMIN role');
  }
}

interface CreateUserInput {
  name: string;
  email: string;
  phone?: string;
  password: string;
  role: UserRole;
  address?: string;
  dateOfBirth?: Date;
  gender?: Gender;
}

export async function createUser(actor: ActingUser, input: CreateUserInput): Promise<User> {
  assertCanAssignRole(actor, input.role);

  const existing = await prisma.user.findUnique({ where: { email: input.email.toLowerCase() } });
  if (existing) throw ApiError.conflict('A user with this email already exists');

  const passwordHash = await hashPassword(input.password);

  return prisma.user.create({
    data: {
      organizationId: actor.organizationId,
      name: input.name,
      email: input.email.toLowerCase(),
      phone: input.phone,
      passwordHash,
      role: input.role,
      address: input.address,
      dateOfBirth: input.dateOfBirth,
      gender: input.gender,
      createdById: actor.id,
    },
  });
}

interface ListUsersQuery extends PaginationQuery {
  role?: UserRole;
  status?: string;
  search?: string;
  wardId?: string;
}

export async function listUsers(actor: ActingUser, query: ListUsersQuery) {
  const where: Prisma.UserWhereInput = {
    organizationId: actor.organizationId,
    deletedAt: null,
    ...(query.role ? { role: query.role } : {}),
    ...(query.status ? { status: query.status as never } : {}),
    ...(query.search
      ? {
          OR: [
            { name: { contains: query.search, mode: 'insensitive' } },
            { email: { contains: query.search, mode: 'insensitive' } },
          ],
        }
      : {}),
    ...(query.wardId ? { geoAssignments: { some: { wardId: query.wardId } } } : {}),
  };

  const [items, totalItems] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      ...toSkipTake(query),
      include: { geoAssignments: { include: { ward: true, tole: true } } },
    }),
    prisma.user.count({ where }),
  ]);

  return { items, totalItems };
}

export async function getUserById(actor: ActingUser, id: string): Promise<User> {
  const user = await prisma.user.findFirst({
    where: { id, organizationId: actor.organizationId, deletedAt: null },
    include: { geoAssignments: { include: { ward: true, tole: true } } },
  });
  if (!user) throw ApiError.notFound('User not found');
  return user;
}

interface UpdateUserInput {
  name?: string;
  phone?: string | null;
  role?: UserRole;
  status?: 'ACTIVE' | 'SUSPENDED' | 'INVITED';
  address?: string | null;
  dateOfBirth?: Date | null;
  gender?: Gender | null;
}

export async function updateUser(actor: ActingUser, id: string, input: UpdateUserInput): Promise<User> {
  const target = await getUserById(actor, id);

  if (input.role) assertCanAssignRole(actor, input.role);

  if (target.role === UserRole.SUPER_ADMIN && actor.role !== UserRole.SUPER_ADMIN) {
    throw ApiError.forbidden('Only a super admin may modify a super admin account');
  }

  return prisma.user.update({ where: { id }, data: input });
}

export async function deleteUser(actor: ActingUser, id: string): Promise<void> {
  const target = await getUserById(actor, id);

  if (target.id === actor.id) {
    throw ApiError.badRequest('You cannot deactivate your own account');
  }
  if (target.role === UserRole.SUPER_ADMIN && actor.role !== UserRole.SUPER_ADMIN) {
    throw ApiError.forbidden('Only a super admin may deactivate a super admin account');
  }

  // Soft delete: preserves audit history / referential integrity for anything
  // this user authored (audit logs, created households, etc. in later modules).
  await prisma.user.update({
    where: { id },
    data: { deletedAt: new Date(), status: 'SUSPENDED' },
  });
  await prisma.refreshToken.updateMany({
    where: { userId: id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

interface AssignGeoInput {
  wardId: string;
  toleId?: string;
}

export async function assignGeo(actor: ActingUser, userId: string, input: AssignGeoInput) {
  const target = await getUserById(actor, userId);

  const ward = await prisma.ward.findUnique({ where: { id: input.wardId } });
  if (!ward) throw ApiError.badRequest('Ward not found');

  if (input.toleId) {
    const tole = await prisma.tole.findUnique({ where: { id: input.toleId } });
    if (!tole || tole.organizationId !== actor.organizationId) {
      throw ApiError.badRequest('Tole not found in your organization');
    }
    if (tole.wardId !== input.wardId) {
      throw ApiError.badRequest('Tole does not belong to the given ward');
    }
  }

  const existing = await prisma.userGeoAssignment.findFirst({
    where: { userId: target.id, wardId: input.wardId, toleId: input.toleId ?? null },
  });
  if (existing) return existing;

  return prisma.userGeoAssignment.create({
    data: { userId: target.id, wardId: input.wardId, toleId: input.toleId },
  });
}

export async function removeGeoAssignment(actor: ActingUser, userId: string, assignmentId: string) {
  await getUserById(actor, userId);
  const assignment = await prisma.userGeoAssignment.findUnique({ where: { id: assignmentId } });
  if (!assignment || assignment.userId !== userId) {
    throw ApiError.notFound('Assignment not found');
  }
  await prisma.userGeoAssignment.delete({ where: { id: assignmentId } });
}
