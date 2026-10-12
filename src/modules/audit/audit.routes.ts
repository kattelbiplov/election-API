import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { requirePermission } from '../../middleware/rbac';
import { PERMISSIONS } from '../../middleware/permissions';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../utils/asyncHandler';
import { listAuditLogsQuerySchema } from './audit.validation';
import { listAuditLogsHandler } from './audit.controller';

const router = Router();

router.get(
  '/',
  authenticate,
  requirePermission(PERMISSIONS.AUDIT_READ),
  validate({ query: listAuditLogsQuerySchema }),
  asyncHandler(listAuditLogsHandler),
);

export default router;
