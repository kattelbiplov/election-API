import { Request, Response } from 'express';
import * as geoService from './geo.service';
import { sendPaginated, sendSuccess } from '../../utils/apiResponse';
import { toPaginationMeta } from '../../utils/pagination';
import { recordAudit } from '../../utils/audit';
import { ApiError } from '../../utils/ApiError';

function actor(req: Request) {
  if (!req.user) throw ApiError.unauthorized();
  return req.user;
}

// --- Province ---
export async function createProvinceHandler(req: Request, res: Response): Promise<void> {
  const province = await geoService.createProvince(req.body);
  await recordAudit({ req, action: 'province.create', entityType: 'Province', entityId: province.id, after: province });
  sendSuccess(res, province, 201);
}
export async function listProvincesHandler(_req: Request, res: Response): Promise<void> {
  sendSuccess(res, await geoService.listProvinces());
}
export async function getProvinceHandler(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await geoService.getProvinceById(req.params.id));
}
export async function updateProvinceHandler(req: Request, res: Response): Promise<void> {
  const before = await geoService.getProvinceById(req.params.id);
  const updated = await geoService.updateProvince(req.params.id, req.body);
  await recordAudit({ req, action: 'province.update', entityType: 'Province', entityId: updated.id, before, after: updated });
  sendSuccess(res, updated);
}

// --- District ---
export async function createDistrictHandler(req: Request, res: Response): Promise<void> {
  const district = await geoService.createDistrict(req.body);
  await recordAudit({ req, action: 'district.create', entityType: 'District', entityId: district.id, after: district });
  sendSuccess(res, district, 201);
}
export async function listDistrictsHandler(req: Request, res: Response): Promise<void> {
  const query = req.query as unknown as Parameters<typeof geoService.listDistricts>[0];
  const { items, totalItems } = await geoService.listDistricts(query);
  sendPaginated(res, items, toPaginationMeta(totalItems, query));
}
export async function getDistrictHandler(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await geoService.getDistrictById(req.params.id));
}
export async function updateDistrictHandler(req: Request, res: Response): Promise<void> {
  const before = await geoService.getDistrictById(req.params.id);
  const updated = await geoService.updateDistrict(req.params.id, req.body);
  await recordAudit({ req, action: 'district.update', entityType: 'District', entityId: updated.id, before, after: updated });
  sendSuccess(res, updated);
}

// --- Municipality ---
export async function createMunicipalityHandler(req: Request, res: Response): Promise<void> {
  const municipality = await geoService.createMunicipality(req.body);
  await recordAudit({ req, action: 'municipality.create', entityType: 'Municipality', entityId: municipality.id, after: municipality });
  sendSuccess(res, municipality, 201);
}
export async function listMunicipalitiesHandler(req: Request, res: Response): Promise<void> {
  const query = req.query as unknown as Parameters<typeof geoService.listMunicipalities>[0];
  const { items, totalItems } = await geoService.listMunicipalities(query);
  sendPaginated(res, items, toPaginationMeta(totalItems, query));
}
export async function getMunicipalityHandler(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await geoService.getMunicipalityById(req.params.id));
}
export async function updateMunicipalityHandler(req: Request, res: Response): Promise<void> {
  const before = await geoService.getMunicipalityById(req.params.id);
  const updated = await geoService.updateMunicipality(req.params.id, req.body);
  await recordAudit({ req, action: 'municipality.update', entityType: 'Municipality', entityId: updated.id, before, after: updated });
  sendSuccess(res, updated);
}

// --- Ward ---
export async function createWardHandler(req: Request, res: Response): Promise<void> {
  const ward = await geoService.createWard(req.body);
  await recordAudit({ req, action: 'ward.create', entityType: 'Ward', entityId: ward.id, after: ward });
  sendSuccess(res, ward, 201);
}
export async function listWardsHandler(req: Request, res: Response): Promise<void> {
  const query = req.query as unknown as Parameters<typeof geoService.listWards>[0];
  const { items, totalItems } = await geoService.listWards(query);
  sendPaginated(res, items, toPaginationMeta(totalItems, query));
}
export async function getWardHandler(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await geoService.getWardById(req.params.id));
}
export async function updateWardHandler(req: Request, res: Response): Promise<void> {
  const before = await geoService.getWardById(req.params.id);
  const updated = await geoService.updateWard(actor(req), req.params.id, req.body);
  await recordAudit({ req, action: 'ward.update', entityType: 'Ward', entityId: updated.id, before, after: updated });
  sendSuccess(res, updated);
}

// --- Tole ---
export async function createToleHandler(req: Request, res: Response): Promise<void> {
  const tole = await geoService.createTole(actor(req), req.body);
  await recordAudit({ req, action: 'tole.create', entityType: 'Tole', entityId: tole.id, after: tole });
  sendSuccess(res, tole, 201);
}
export async function listTolesHandler(req: Request, res: Response): Promise<void> {
  const query = req.query as unknown as Parameters<typeof geoService.listToles>[1];
  const { items, totalItems } = await geoService.listToles(actor(req), query);
  sendPaginated(res, items, toPaginationMeta(totalItems, query));
}
export async function getToleHandler(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await geoService.getToleById(actor(req), req.params.id));
}
export async function updateToleHandler(req: Request, res: Response): Promise<void> {
  const before = await geoService.getToleById(actor(req), req.params.id);
  const updated = await geoService.updateTole(actor(req), req.params.id, req.body);
  await recordAudit({ req, action: 'tole.update', entityType: 'Tole', entityId: updated.id, before, after: updated });
  sendSuccess(res, updated);
}
export async function deleteToleHandler(req: Request, res: Response): Promise<void> {
  await geoService.deleteTole(actor(req), req.params.id);
  await recordAudit({ req, action: 'tole.delete', entityType: 'Tole', entityId: req.params.id });
  sendSuccess(res, { message: 'Tole deleted' });
}

export async function checkToleBoundaryHandler(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await geoService.checkToleBoundary(actor(req), req.params.id));
}

export async function importGeoDatasetHandler(req: Request, res: Response): Promise<void> {
  if (!req.file) throw ApiError.badRequest('No file uploaded — attach it as multipart field "file"');

  const summary = await geoService.importGeoDataset(req.file);
  await recordAudit({
    req,
    action: 'geo.import',
    entityType: 'GeoDataset',
    after: summary,
  });
  sendSuccess(res, summary);
}
