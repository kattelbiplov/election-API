import { Organization, Prisma, UserRole } from '@prisma/client';
import { prisma } from '../../config/db';
import { ApiError } from '../../utils/ApiError';
import { hashPassword } from '../../utils/password';
import { PaginationQuery, toSkipTake } from '../../utils/pagination';

interface CreateOrganizationInput {
  name: string;
  slug: string;
  adminName: string;
  adminEmail: string;
  adminPassword: string;
}

// Creates the tenant and its first CAMPAIGN_ADMIN user atomically — an
// Organization with zero admins would be locked out of itself, so both rows
// (or neither) must be written.
export async function createOrganization(input: CreateOrganizationInput) {
  const existingSlug = await prisma.organization.findUnique({ where: { slug: input.slug } });
  if (existingSlug) throw ApiError.conflict('An organization with this slug already exists');

  const existingEmail = await prisma.user.findUnique({ where: { email: input.adminEmail.toLowerCase() } });
  if (existingEmail) throw ApiError.conflict('A user with this email already exists');

  const passwordHash = await hashPassword(input.adminPassword);

  return prisma.$transaction(async (tx) => {
    const organization = await tx.organization.create({
      data: { name: input.name, slug: input.slug },
    });

    const admin = await tx.user.create({
      data: {
        organizationId: organization.id,
        name: input.adminName,
        email: input.adminEmail.toLowerCase(),
        passwordHash,
        role: UserRole.CAMPAIGN_ADMIN,
      },
    });

    return { organization, admin };
  });
}

export async function listOrganizations(query: PaginationQuery & { search?: string }) {
  const where: Prisma.OrganizationWhereInput = query.search
    ? { name: { contains: query.search, mode: 'insensitive' } }
    : {};

  const [items, totalItems] = await Promise.all([
    prisma.organization.findMany({ where, orderBy: { createdAt: 'desc' }, ...toSkipTake(query) }),
    prisma.organization.count({ where }),
  ]);

  return { items, totalItems };
}

export async function getOrganizationById(id: string): Promise<Organization> {
  const org = await prisma.organization.findUnique({ where: { id } });
  if (!org) throw ApiError.notFound('Organization not found');
  return org;
}

export async function updateOrganization(
  id: string,
  data: Partial<Pick<Organization, 'name' | 'status'>>,
): Promise<Organization> {
  await getOrganizationById(id);
  return prisma.organization.update({ where: { id }, data });
}
