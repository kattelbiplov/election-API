import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { requirePermission } from '../../middleware/rbac';
import { PERMISSIONS } from '../../middleware/permissions';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../utils/asyncHandler';
import {
  assignGeoSchema,
  createUserSchema,
  listUsersQuerySchema,
  removeAssignmentParamSchema,
  updateUserSchema,
  userIdParamSchema,
} from './users.validation';
import {
  assignGeoHandler,
  createUserHandler,
  deleteUserHandler,
  getUserHandler,
  listUsersHandler,
  removeGeoAssignmentHandler,
  updateUserHandler,
} from './users.controller';

const router = Router();

router.use(authenticate);

router.post(
  '/',
  requirePermission(PERMISSIONS.USER_CREATE),
  validate({ body: createUserSchema }),
  asyncHandler(createUserHandler),
);

router.get(
  '/',
  requirePermission(PERMISSIONS.USER_READ),
  validate({ query: listUsersQuerySchema }),
  asyncHandler(listUsersHandler),
);

router.get(
  '/:id',
  requirePermission(PERMISSIONS.USER_READ),
  validate({ params: userIdParamSchema }),
  asyncHandler(getUserHandler),
);

router.patch(
  '/:id',
  requirePermission(PERMISSIONS.USER_UPDATE),
  validate({ params: userIdParamSchema, body: updateUserSchema }),
  asyncHandler(updateUserHandler),
);

router.delete(
  '/:id',
  requirePermission(PERMISSIONS.USER_DELETE),
  validate({ params: userIdParamSchema }),
  asyncHandler(deleteUserHandler),
);

router.post(
  '/:id/assignments',
  requirePermission(PERMISSIONS.USER_ASSIGN_GEO),
  validate({ params: userIdParamSchema, body: assignGeoSchema }),
  asyncHandler(assignGeoHandler),
);

router.delete(
  '/:id/assignments/:assignmentId',
  requirePermission(PERMISSIONS.USER_ASSIGN_GEO),
  validate({ params: removeAssignmentParamSchema }),
  asyncHandler(removeGeoAssignmentHandler),
);

export default router;
