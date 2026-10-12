import { Request, Response } from 'express';
import * as auditService from './audit.service';
import { sendPaginated } from '../../utils/apiResponse';
import { toPaginationMeta } from '../../utils/pagination';
import { ApiError } from '../../utils/ApiError';

export async function listAuditLogsHandler(req: Request, res: Response): Promise<void> {
  if (!req.user) throw ApiError.unauthorized();
  const query = req.query as unknown as Parameters<typeof auditService.listAuditLogs>[1];
  const { items, totalItems } = await auditService.listAuditLogs(req.user, query);
  sendPaginated(res, items, toPaginationMeta(totalItems, query));
}
