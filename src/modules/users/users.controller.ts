import { Request, Response } from 'express';
import * as usersService from './users.service';
import { sendPaginated, sendSuccess } from '../../utils/apiResponse';
import { toPaginationMeta } from '../../utils/pagination';
import { toPublicUser } from '../../utils/serializers';
import { recordAudit } from '../../utils/audit';
import { ApiError } from '../../utils/ApiError';

function actor(req: Request) {
  if (!req.user) throw ApiError.unauthorized();
  return req.user;
}

export async function createUserHandler(req: Request, res: Response): Promise<void> {
  const user = await usersService.createUser(actor(req), req.body);
  await recordAudit({
    req,
    action: 'user.create',
    entityType: 'User',
    entityId: user.id,
    after: toPublicUser(user),
  });
  sendSuccess(res, toPublicUser(user), 201);
}

export async function listUsersHandler(req: Request, res: Response): Promise<void> {
  const query = req.query as unknown as Parameters<typeof usersService.listUsers>[1];
  const { items, totalItems } = await usersService.listUsers(actor(req), query);
  sendPaginated(res, items.map(toPublicUser), toPaginationMeta(totalItems, query));
}

export async function getUserHandler(req: Request, res: Response): Promise<void> {
  const user = await usersService.getUserById(actor(req), req.params.id);
  sendSuccess(res, toPublicUser(user));
}

export async function updateUserHandler(req: Request, res: Response): Promise<void> {
  const before = await usersService.getUserById(actor(req), req.params.id);
  const updated = await usersService.updateUser(actor(req), req.params.id, req.body);
  await recordAudit({
    req,
    action: 'user.update',
    entityType: 'User',
    entityId: updated.id,
    before: toPublicUser(before),
    after: toPublicUser(updated),
  });
  sendSuccess(res, toPublicUser(updated));
}

export async function deleteUserHandler(req: Request, res: Response): Promise<void> {
  await usersService.deleteUser(actor(req), req.params.id);
  await recordAudit({ req, action: 'user.deactivate', entityType: 'User', entityId: req.params.id });
  sendSuccess(res, { message: 'User deactivated' });
}

export async function assignGeoHandler(req: Request, res: Response): Promise<void> {
  const assignment = await usersService.assignGeo(actor(req), req.params.id, req.body);
  await recordAudit({
    req,
    action: 'user.assign_geo',
    entityType: 'UserGeoAssignment',
    entityId: assignment.id,
    after: assignment,
  });
  sendSuccess(res, assignment, 201);
}

export async function removeGeoAssignmentHandler(req: Request, res: Response): Promise<void> {
  await usersService.removeGeoAssignment(actor(req), req.params.id, req.params.assignmentId);
  await recordAudit({
    req,
    action: 'user.remove_geo_assignment',
    entityType: 'UserGeoAssignment',
    entityId: req.params.assignmentId,
  });
  sendSuccess(res, { message: 'Assignment removed' });
}
