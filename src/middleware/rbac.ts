import { NextFunction, Request, Response } from 'express';
import { ApiError } from '../utils/ApiError';
import { Permission, roleHasPermission } from './permissions';

// Usage: router.post('/wards', authenticate, requirePermission(PERMISSIONS.WARD_MANAGE), handler)
// Must run after `authenticate`. Checks role -> permission only; any further
// scoping (e.g. "this WARD_MANAGER may only edit wards they're assigned to")
// is enforced separately in the service layer via geoScope.ts, because it
// requires a DB lookup that shouldn't run on every request regardless of role.
export function requirePermission(...permissions: Permission[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      throw ApiError.unauthorized();
    }
    const hasAll = permissions.every((p) => roleHasPermission(req.user!.role, p));
    if (!hasAll) {
      throw ApiError.forbidden(
        `Role '${req.user.role}' lacks required permission(s): ${permissions.join(', ')}`,
      );
    }
    next();
  };
}
