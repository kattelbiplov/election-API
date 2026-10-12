import { Request, Response } from 'express';
import * as authService from './auth.service';
import { sendSuccess } from '../../utils/apiResponse';
import { toPublicUser } from '../../utils/serializers';
import { recordAudit } from '../../utils/audit';
import { ApiError } from '../../utils/ApiError';

export async function loginHandler(req: Request, res: Response): Promise<void> {
  const { email, password } = req.body;
  const { user, tokens } = await authService.login(email, password, {
    ip: req.ip,
    userAgent: req.headers['user-agent'],
  });

  await recordAudit({ req, action: 'auth.login', entityType: 'User', entityId: user.id });

  sendSuccess(res, { user: toPublicUser(user), ...tokens });
}

export async function refreshHandler(req: Request, res: Response): Promise<void> {
  const { refreshToken } = req.body;
  const tokens = await authService.refresh(refreshToken, {
    ip: req.ip,
    userAgent: req.headers['user-agent'],
  });
  sendSuccess(res, tokens);
}

export async function logoutHandler(req: Request, res: Response): Promise<void> {
  const { refreshToken } = req.body;
  await authService.logout(refreshToken);
  await recordAudit({ req, action: 'auth.logout', entityType: 'User', entityId: req.user?.id });
  sendSuccess(res, { message: 'Logged out' });
}

export async function meHandler(req: Request, res: Response): Promise<void> {
  if (!req.user) throw ApiError.unauthorized();
  const user = await authService.getCurrentUser(req.user.id);
  sendSuccess(res, toPublicUser(user));
}

export async function changePasswordHandler(req: Request, res: Response): Promise<void> {
  if (!req.user) throw ApiError.unauthorized();
  const { currentPassword, newPassword } = req.body;
  await authService.changePassword(req.user.id, currentPassword, newPassword);
  await recordAudit({ req, action: 'auth.change_password', entityType: 'User', entityId: req.user.id });
  sendSuccess(res, { message: 'Password changed. All other sessions have been logged out.' });
}
