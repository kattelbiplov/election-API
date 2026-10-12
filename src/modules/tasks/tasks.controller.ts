import { Request, Response } from 'express';
import * as tasksService from './tasks.service';
import { sendPaginated, sendSuccess } from '../../utils/apiResponse';
import { toPaginationMeta } from '../../utils/pagination';
import { recordAudit } from '../../utils/audit';
import { ApiError } from '../../utils/ApiError';

function actor(req: Request) {
  if (!req.user) throw ApiError.unauthorized();
  return req.user;
}

export async function createTaskHandler(req: Request, res: Response): Promise<void> {
  const task = await tasksService.createTask(actor(req), req.body);
  await recordAudit({ req, action: 'task.create', entityType: 'CanvassingTask', entityId: task.id, after: task });
  sendSuccess(res, task, 201);
}

export async function listTasksHandler(req: Request, res: Response): Promise<void> {
  const query = req.query as unknown as Parameters<typeof tasksService.listTasks>[1];
  const { items, totalItems } = await tasksService.listTasks(actor(req), query);
  sendPaginated(res, items, toPaginationMeta(totalItems, query));
}

export async function getTaskHandler(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await tasksService.getTaskById(actor(req), req.params.id));
}

export async function updateTaskHandler(req: Request, res: Response): Promise<void> {
  const before = await tasksService.getTaskById(actor(req), req.params.id);
  const updated = await tasksService.updateTask(actor(req), req.params.id, req.body);
  await recordAudit({ req, action: 'task.update', entityType: 'CanvassingTask', entityId: updated.id, before, after: updated });
  sendSuccess(res, updated);
}

export async function deleteTaskHandler(req: Request, res: Response): Promise<void> {
  await tasksService.deleteTask(actor(req), req.params.id);
  await recordAudit({ req, action: 'task.delete', entityType: 'CanvassingTask', entityId: req.params.id });
  sendSuccess(res, { message: 'Task deleted' });
}

export async function listVisitsHandler(req: Request, res: Response): Promise<void> {
  const query = req.query as unknown as Parameters<typeof tasksService.listVisits>[2];
  const { items, totalItems } = await tasksService.listVisits(actor(req), req.params.id, query);
  sendPaginated(res, items, toPaginationMeta(totalItems, query));
}

export async function updateVisitHandler(req: Request, res: Response): Promise<void> {
  const updated = await tasksService.updateVisit(actor(req), req.params.id, req.params.visitId, req.body);
  await recordAudit({
    req,
    action: 'task.visit_update',
    entityType: 'CanvassingVisit',
    entityId: updated.id,
    after: updated,
  });
  sendSuccess(res, updated);
}
