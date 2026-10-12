import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { requirePermission } from '../../middleware/rbac';
import { PERMISSIONS } from '../../middleware/permissions';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../utils/asyncHandler';
import * as v from './reports.validation';
import * as c from './reports.controller';

const router = Router();
router.use(authenticate);

router.get(
  '/dashboard',
  requirePermission(PERMISSIONS.REPORT_READ),
  validate({ query: v.dashboardQuerySchema }),
  asyncHandler(c.getDashboardHandler),
);

export default router;
