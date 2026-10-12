import { NextFunction, Request, Response } from 'express';
import { ApiError } from '../utils/ApiError';
import { verifyAccessToken } from '../utils/jwt';

// Verifies the bearer access token and attaches req.user. Does NOT check the
// user still exists / is active in the database on every request (that would
// be a DB round-trip per request) — status changes take effect on next token
// refresh, and refresh tokens are checked against the DB (see auth.service).
export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    throw ApiError.unauthorized('Missing or malformed Authorization header');
  }

  const token = header.slice('Bearer '.length).trim();

  try {
    const payload = verifyAccessToken(token);
    req.user = { id: payload.sub, organizationId: payload.organizationId, role: payload.role };
    next();
  } catch {
    throw ApiError.unauthorized('Invalid or expired access token');
  }
}
