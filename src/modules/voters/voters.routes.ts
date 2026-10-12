import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../../middleware/auth';
import { requirePermission } from '../../middleware/rbac';
import { PERMISSIONS } from '../../middleware/permissions';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../utils/asyncHandler';
import { ApiError } from '../../utils/ApiError';
import { IMPORT_MAX_FILE_BYTES } from './voters.import';
import * as v from './voters.validation';
import * as c from './voters.controller';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: IMPORT_MAX_FILE_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      'text/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ];
    const ext = file.originalname.toLowerCase().split('.').pop();
    if (allowed.includes(file.mimetype) || ext === 'csv' || ext === 'xlsx' || ext === 'xls') {
      cb(null, true);
    } else {
      cb(ApiError.badRequest('Unsupported file type — upload a .csv or .xlsx file'));
    }
  },
});

const router = Router();
router.use(authenticate);

// --- Voter CRUD ---
router.post(
  '/',
  requirePermission(PERMISSIONS.VOTER_CREATE),
  validate({ body: v.createVoterSchema }),
  asyncHandler(c.createVoterHandler),
);

router.get(
  '/',
  requirePermission(PERMISSIONS.VOTER_READ),
  validate({ query: v.listVotersQuerySchema }),
  asyncHandler(c.listVotersHandler),
);

// --- Import (literal paths registered before "/:id" so they aren't
// swallowed by the parametrized voter routes below) ---
router.post(
  '/import',
  requirePermission(PERMISSIONS.VOTER_IMPORT),
  upload.single('file'),
  validate({ body: v.startImportSchema }),
  asyncHandler(c.startImportHandler),
);

router.get(
  '/import-jobs',
  requirePermission(PERMISSIONS.VOTER_IMPORT_READ),
  validate({ query: v.listImportJobsQuerySchema }),
  asyncHandler(c.listImportJobsHandler),
);

router.get(
  '/import-jobs/:id',
  requirePermission(PERMISSIONS.VOTER_IMPORT_READ),
  validate({ params: v.importJobIdParamSchema }),
  asyncHandler(c.getImportJobHandler),
);

router.get(
  '/import-jobs/:id/issues',
  requirePermission(PERMISSIONS.VOTER_IMPORT_READ),
  validate({ params: v.importJobIdParamSchema, query: v.listImportIssuesQuerySchema }),
  asyncHandler(c.listImportIssuesHandler),
);

router.get(
  '/:id',
  requirePermission(PERMISSIONS.VOTER_READ),
  validate({ params: v.idParamSchema }),
  asyncHandler(c.getVoterHandler),
);

router.patch(
  '/:id',
  requirePermission(PERMISSIONS.VOTER_UPDATE),
  validate({ params: v.idParamSchema, body: v.updateVoterSchema }),
  asyncHandler(c.updateVoterHandler),
);

router.delete(
  '/:id',
  requirePermission(PERMISSIONS.VOTER_DELETE),
  validate({ params: v.idParamSchema }),
  asyncHandler(c.deleteVoterHandler),
);

// --- Contact history (append-only — no PATCH/DELETE) ---
router.post(
  '/:id/contacts',
  requirePermission(PERMISSIONS.VOTER_UPDATE),
  validate({ params: v.idParamSchema, body: v.createContactSchema }),
  asyncHandler(c.createContactHandler),
);

router.get(
  '/:id/contacts',
  requirePermission(PERMISSIONS.VOTER_READ),
  validate({ params: v.idParamSchema, query: v.listContactsQuerySchema }),
  asyncHandler(c.listContactsHandler),
);

// --- Family relationships (Module 09) — relatedVoterId must already exist,
// there is no create-inline path here ---
router.post(
  '/:id/relationships',
  requirePermission(PERMISSIONS.VOTER_UPDATE),
  validate({ params: v.idParamSchema, body: v.createRelationshipSchema }),
  asyncHandler(c.createRelationshipHandler),
);

router.get(
  '/:id/relationships',
  requirePermission(PERMISSIONS.VOTER_READ),
  validate({ params: v.idParamSchema }),
  asyncHandler(c.listRelationshipsHandler),
);

router.delete(
  '/:id/relationships/:relationshipId',
  requirePermission(PERMISSIONS.VOTER_UPDATE),
  validate({ params: v.relationshipParamSchema }),
  asyncHandler(c.deleteRelationshipHandler),
);

export default router;
