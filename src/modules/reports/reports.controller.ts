import { Request, Response } from 'express';
import * as reportsService from './reports.service';
import { sendSuccess } from '../../utils/apiResponse';
import { ApiError } from '../../utils/ApiError';

function actor(req: Request) {
  if (!req.user) throw ApiError.unauthorized();
  return req.user;
}

export async function getDashboardHandler(req: Request, res: Response): Promise<void> {
  const query = req.query as unknown as Parameters<typeof reportsService.getDashboard>[1];
  sendSuccess(res, await reportsService.getDashboard(actor(req), query));
}
