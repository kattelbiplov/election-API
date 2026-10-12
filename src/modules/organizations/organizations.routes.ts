import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { requirePermission } from '../../middleware/rbac';
import { PERMISSIONS } from '../../middleware/permissions';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../utils/asyncHandler';
import {
  createOrganizationSchema,
  listOrganizationsQuerySchema,
  orgIdParamSchema,
  updateOrganizationSchema,
} from './organizations.validation';
import {
  createOrganizationHandler,
  getOrganizationHandler,
  listOrganizationsHandler,
  updateOrganizationHandler,
} from './organizations.controller';

const router = Router();

// Organization creation is SUPER_ADMIN only — this is platform-operator territory
// (onboarding a new campaign client), not something a campaign admin does to itself.
router.post(
  '/',
  authenticate,
  requirePermission(PERMISSIONS.ORG_CREATE),
  validate({ body: createOrganizationSchema }),
  asyncHandler(createOrganizationHandler),
);

router.get(
  '/',
  authenticate,
  requirePermission(PERMISSIONS.ORG_CREATE),
  validate({ query: listOrganizationsQuerySchema }),
  asyncHandler(listOrganizationsHandler),
);

router.get(
  '/:id',
  authenticate,
  requirePermission(PERMISSIONS.ORG_READ),
  validate({ params: orgIdParamSchema }),
  asyncHandler(getOrganizationHandler),
);

router.patch(
  '/:id',
  authenticate,
  requirePermission(PERMISSIONS.ORG_UPDATE),
  validate({ params: orgIdParamSchema, body: updateOrganizationSchema }),
  asyncHandler(updateOrganizationHandler),
);

export default router;
