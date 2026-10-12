import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { requirePermission } from '../../middleware/rbac';
import { PERMISSIONS } from '../../middleware/permissions';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../utils/asyncHandler';
import * as v from './households.validation';
import * as c from './households.controller';

const router = Router();
router.use(authenticate);

router.post(
  '/',
  requirePermission(PERMISSIONS.HOUSEHOLD_CREATE),
  validate({ body: v.createHouseholdSchema }),
  asyncHandler(c.createHouseholdHandler),
);

router.get(
  '/',
  requirePermission(PERMISSIONS.HOUSEHOLD_READ),
  validate({ query: v.listHouseholdsQuerySchema }),
  asyncHandler(c.listHouseholdsHandler),
);

// --- GIS (literal paths registered before "/:id" for the same reason as
// voters.routes.ts's /import — otherwise ":id" would swallow them) ---
router.get(
  '/nearby',
  requirePermission(PERMISSIONS.HOUSEHOLD_READ),
  validate({ query: v.nearbyHouseholdsQuerySchema }),
  asyncHandler(c.nearbyHouseholdsHandler),
);

router.post(
  '/search/within-polygon',
  requirePermission(PERMISSIONS.HOUSEHOLD_READ),
  validate({ body: v.withinPolygonBodySchema, query: v.withinPolygonQuerySchema }),
  asyncHandler(c.withinPolygonHandler),
);

router.get(
  '/:id',
  requirePermission(PERMISSIONS.HOUSEHOLD_READ),
  validate({ params: v.idParamSchema }),
  asyncHandler(c.getHouseholdHandler),
);

router.patch(
  '/:id',
  requirePermission(PERMISSIONS.HOUSEHOLD_UPDATE),
  validate({ params: v.idParamSchema, body: v.updateHouseholdSchema }),
  asyncHandler(c.updateHouseholdHandler),
);

router.delete(
  '/:id',
  requirePermission(PERMISSIONS.HOUSEHOLD_DELETE),
  validate({ params: v.idParamSchema }),
  asyncHandler(c.deleteHouseholdHandler),
);

// --- Family tree (Module 09) ---
router.get(
  '/:id/family-tree',
  requirePermission(PERMISSIONS.HOUSEHOLD_READ),
  validate({ params: v.idParamSchema }),
  asyncHandler(c.getFamilyTreeHandler),
);

export default router;
