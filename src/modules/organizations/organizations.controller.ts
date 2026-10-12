import { Request, Response } from 'express';
import { UserRole } from '@prisma/client';
import * as orgService from './organizations.service';
import { sendPaginated, sendSuccess } from '../../utils/apiResponse';
import { toPaginationMeta } from '../../utils/pagination';
import { toPublicUser } from '../../utils/serializers';
import { recordAudit } from '../../utils/audit';
import { ApiError } from '../../utils/ApiError';

export async function createOrganizationHandler(req: Request, res: Response): Promise<void> {
  const { organization, admin } = await orgService.createOrganization(req.body);
  await recordAudit({
    req,
    action: 'organization.create',
    entityType: 'Organization',
    entityId: organization.id,
    after: organization,
  });
  sendSuccess(res, { organization, admin: toPublicUser(admin) }, 201);
}

export async function listOrganizationsHandler(req: Request, res: Response): Promise<void> {
  const query = req.query as unknown as Parameters<typeof orgService.listOrganizations>[0];
  const { items, totalItems } = await orgService.listOrganizations(query);
  sendPaginated(res, items, toPaginationMeta(totalItems, query));
}

// CAMPAIGN_ADMIN and below may only read/update their own organization;
// only SUPER_ADMIN can address an arbitrary org by id.
function assertSelfOrgOrSuperAdmin(req: Request): void {
  if (req.user!.role === UserRole.SUPER_ADMIN) return;
  if (req.params.id !== req.user!.organizationId) {
    throw ApiError.forbidden('You may only access your own organization');
  }
}

export async function getOrganizationHandler(req: Request, res: Response): Promise<void> {
  assertSelfOrgOrSuperAdmin(req);
  const org = await orgService.getOrganizationById(req.params.id);
  sendSuccess(res, org);
}

export async function updateOrganizationHandler(req: Request, res: Response): Promise<void> {
  assertSelfOrgOrSuperAdmin(req);
  // Only SUPER_ADMIN may change `status` (suspend/reactivate a tenant) — a
  // campaign admin editing their own org must never be able to un-suspend it.
  if (req.body.status !== undefined && req.user!.role !== UserRole.SUPER_ADMIN) {
    throw ApiError.forbidden('Only a platform super admin may change organization status');
  }
  const before = await orgService.getOrganizationById(req.params.id);
  const updated = await orgService.updateOrganization(req.params.id, req.body);
  await recordAudit({
    req,
    action: 'organization.update',
    entityType: 'Organization',
    entityId: updated.id,
    before,
    after: updated,
  });
  sendSuccess(res, updated);
}
