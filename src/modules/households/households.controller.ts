import { Request, Response } from 'express';
import * as householdsService from './households.service';
import { sendPaginated, sendSuccess } from '../../utils/apiResponse';
import { toPaginationMeta } from '../../utils/pagination';
import { recordAudit } from '../../utils/audit';
import { ApiError } from '../../utils/ApiError';

function actor(req: Request) {
  if (!req.user) throw ApiError.unauthorized();
  return req.user;
}

export async function createHouseholdHandler(req: Request, res: Response): Promise<void> {
  const household = await householdsService.createHousehold(actor(req), req.body);
  await recordAudit({ req, action: 'household.create', entityType: 'Household', entityId: household.id, after: household });
  sendSuccess(res, household, 201);
}

export async function listHouseholdsHandler(req: Request, res: Response): Promise<void> {
  const query = req.query as unknown as Parameters<typeof householdsService.listHouseholds>[1];
  const { items, totalItems } = await householdsService.listHouseholds(actor(req), query);
  sendPaginated(res, items, toPaginationMeta(totalItems, query));
}

export async function getHouseholdHandler(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await householdsService.getHouseholdById(actor(req), req.params.id));
}

export async function updateHouseholdHandler(req: Request, res: Response): Promise<void> {
  const before = await householdsService.getHouseholdById(actor(req), req.params.id);
  const updated = await householdsService.updateHousehold(actor(req), req.params.id, req.body);
  await recordAudit({ req, action: 'household.update', entityType: 'Household', entityId: updated.id, before, after: updated });
  sendSuccess(res, updated);
}

export async function deleteHouseholdHandler(req: Request, res: Response): Promise<void> {
  await householdsService.deleteHousehold(actor(req), req.params.id);
  await recordAudit({ req, action: 'household.delete', entityType: 'Household', entityId: req.params.id });
  sendSuccess(res, { message: 'Household deleted' });
}

// --- GIS ---
export async function nearbyHouseholdsHandler(req: Request, res: Response): Promise<void> {
  const query = req.query as unknown as Parameters<typeof householdsService.findNearbyHouseholds>[1];
  const { items, totalItems } = await householdsService.findNearbyHouseholds(actor(req), query);
  sendPaginated(res, items, toPaginationMeta(totalItems, query));
}

export async function withinPolygonHandler(req: Request, res: Response): Promise<void> {
  const query = req.query as unknown as { page: number; pageSize: number };
  const { items, totalItems } = await householdsService.findHouseholdsWithinPolygon(actor(req), {
    ...req.body,
    ...query,
  });
  sendPaginated(res, items, toPaginationMeta(totalItems, query));
}

// --- Family tree (Module 09) ---
export async function getFamilyTreeHandler(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await householdsService.getFamilyTree(actor(req), req.params.id));
}
