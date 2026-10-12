import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { requirePermission } from '../../middleware/rbac';
import { PERMISSIONS } from '../../middleware/permissions';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../utils/asyncHandler';
import * as v from './tasks.validation';
import * as c from './tasks.controller';

const router = Router();
router.use(authenticate);

router.post(
  '/',
  requirePermission(PERMISSIONS.TASK_CREATE),
  validate({ body: v.createTaskSchema }),
  asyncHandler(c.createTaskHandler),
);

router.get(
  '/',
  requirePermission(PERMISSIONS.TASK_READ),
  validate({ query: v.listTasksQuerySchema }),
  asyncHandler(c.listTasksHandler),
);

router.get(
  '/:id',
  requirePermission(PERMISSIONS.TASK_READ),
  validate({ params: v.idParamSchema }),
  asyncHandler(c.getTaskHandler),
);

router.patch(
  '/:id',
  requirePermission(PERMISSIONS.TASK_UPDATE),
  validate({ params: v.idParamSchema, body: v.updateTaskSchema }),
  asyncHandler(c.updateTaskHandler),
);

router.delete(
  '/:id',
  requirePermission(PERMISSIONS.TASK_DELETE),
  validate({ params: v.idParamSchema }),
  asyncHandler(c.deleteTaskHandler),
);

router.get(
  '/:id/visits',
  requirePermission(PERMISSIONS.TASK_READ),
  validate({ params: v.idParamSchema, query: v.listVisitsQuerySchema }),
  asyncHandler(c.listVisitsHandler),
);

router.patch(
  '/:id/visits/:visitId',
  requirePermission(PERMISSIONS.TASK_VISIT_UPDATE),
  validate({ params: v.visitParamSchema, body: v.updateVisitSchema }),
  asyncHandler(c.updateVisitHandler),
);

export default router;
