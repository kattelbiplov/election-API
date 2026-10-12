import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../../middleware/auth';
import { requirePermission } from '../../middleware/rbac';
import { PERMISSIONS } from '../../middleware/permissions';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../utils/asyncHandler';
import { ApiError } from '../../utils/ApiError';
import { GEO_IMPORT_MAX_FILE_BYTES } from './geo.import';
import * as v from './geo.validation';
import * as c from './geo.controller';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: GEO_IMPORT_MAX_FILE_BYTES, files: 1 },
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

const readGeo = requirePermission(PERMISSIONS.GEO_READ);
const manageNational = requirePermission(PERMISSIONS.GEO_MANAGE_NATIONAL);

// --- Provinces (official data — SUPER_ADMIN managed) ---
router.post('/provinces', manageNational, validate({ body: v.createProvinceSchema }), asyncHandler(c.createProvinceHandler));
router.get('/provinces', readGeo, asyncHandler(c.listProvincesHandler));
router.get('/provinces/:id', readGeo, validate({ params: v.idParamSchema }), asyncHandler(c.getProvinceHandler));
router.patch('/provinces/:id', manageNational, validate({ params: v.idParamSchema, body: v.updateProvinceSchema }), asyncHandler(c.updateProvinceHandler));

// --- Districts ---
router.post('/districts', manageNational, validate({ body: v.createDistrictSchema }), asyncHandler(c.createDistrictHandler));
router.get('/districts', readGeo, validate({ query: v.listDistrictsQuerySchema }), asyncHandler(c.listDistrictsHandler));
router.get('/districts/:id', readGeo, validate({ params: v.idParamSchema }), asyncHandler(c.getDistrictHandler));
router.patch('/districts/:id', manageNational, validate({ params: v.idParamSchema, body: v.updateDistrictSchema }), asyncHandler(c.updateDistrictHandler));

// --- Municipalities ---
router.post('/municipalities', manageNational, validate({ body: v.createMunicipalitySchema }), asyncHandler(c.createMunicipalityHandler));
router.get('/municipalities', readGeo, validate({ query: v.listMunicipalitiesQuerySchema }), asyncHandler(c.listMunicipalitiesHandler));
router.get('/municipalities/:id', readGeo, validate({ params: v.idParamSchema }), asyncHandler(c.getMunicipalityHandler));
router.patch('/municipalities/:id', manageNational, validate({ params: v.idParamSchema, body: v.updateMunicipalitySchema }), asyncHandler(c.updateMunicipalityHandler));

// --- Wards ---
router.post('/wards', requirePermission(PERMISSIONS.WARD_MANAGE), validate({ body: v.createWardSchema }), asyncHandler(c.createWardHandler));
router.get('/wards', readGeo, validate({ query: v.listWardsQuerySchema }), asyncHandler(c.listWardsHandler));
router.get('/wards/:id', readGeo, validate({ params: v.idParamSchema }), asyncHandler(c.getWardHandler));
router.patch('/wards/:id', requirePermission(PERMISSIONS.WARD_MANAGE), validate({ params: v.idParamSchema, body: v.updateWardSchema }), asyncHandler(c.updateWardHandler));

// --- Toles (organization-scoped) ---
router.post('/toles', requirePermission(PERMISSIONS.TOLE_CREATE), validate({ body: v.createToleSchema }), asyncHandler(c.createToleHandler));
router.get('/toles', readGeo, validate({ query: v.listTolesQuerySchema }), asyncHandler(c.listTolesHandler));
router.get('/toles/:id', readGeo, validate({ params: v.idParamSchema }), asyncHandler(c.getToleHandler));
router.patch('/toles/:id', requirePermission(PERMISSIONS.TOLE_UPDATE), validate({ params: v.idParamSchema, body: v.updateToleSchema }), asyncHandler(c.updateToleHandler));
router.delete('/toles/:id', requirePermission(PERMISSIONS.TOLE_DELETE), validate({ params: v.idParamSchema }), asyncHandler(c.deleteToleHandler));

// GIS (docs/modules/03-household-gis.md) — gated on household:read (not
// geo:read) since the result is household PII, not tole metadata.
router.get(
  '/toles/:id/boundary-check',
  requirePermission(PERMISSIONS.HOUSEHOLD_READ),
  validate({ params: v.idParamSchema }),
  asyncHandler(c.checkToleBoundaryHandler),
);

// Bulk-loads the real Nepal administrative dataset — see
// docs/modules/05-geo-dataset-import.md. SUPER_ADMIN only, same as every
// other province/district/municipality write above.
router.post('/geo/import', manageNational, upload.single('file'), asyncHandler(c.importGeoDatasetHandler));

export default router;
