import { z } from 'zod';
import { MunicipalityType } from '@prisma/client';
import { paginationQuerySchema } from '../../utils/pagination';

export const idParamSchema = z.object({ id: z.string().uuid() });

// --- Province -----------------------------------------------------------
export const createProvinceSchema = z.object({
  code: z.number().int().min(1).max(20),
  name: z.string().min(2).max(120),
  nameNepali: z.string().max(120).optional(),
});
export const updateProvinceSchema = createProvinceSchema.partial();

// --- District -------------------------------------------------------------
export const createDistrictSchema = z.object({
  provinceId: z.string().uuid(),
  code: z.string().min(1).max(20),
  name: z.string().min(2).max(120),
  nameNepali: z.string().max(120).optional(),
});
export const updateDistrictSchema = createDistrictSchema.partial();
export const listDistrictsQuerySchema = paginationQuerySchema.extend({
  provinceId: z.string().uuid().optional(),
});

// --- Municipality -----------------------------------------------------------
export const createMunicipalitySchema = z.object({
  districtId: z.string().uuid(),
  code: z.string().min(1).max(20),
  name: z.string().min(2).max(120),
  nameNepali: z.string().max(120).optional(),
  type: z.nativeEnum(MunicipalityType),
  totalWards: z.number().int().min(1).max(35),
});
export const updateMunicipalitySchema = createMunicipalitySchema.partial();
export const listMunicipalitiesQuerySchema = paginationQuerySchema.extend({
  districtId: z.string().uuid().optional(),
  search: z.string().trim().min(1).optional(),
});

// --- Ward -----------------------------------------------------------
export const createWardSchema = z.object({
  municipalityId: z.string().uuid(),
  wardNumber: z.number().int().min(1).max(35),
  name: z.string().max(120).optional(),
  population: z.number().int().min(0).optional(),
});
export const updateWardSchema = z.object({
  name: z.string().max(120).nullable().optional(),
  population: z.number().int().min(0).nullable().optional(),
});
export const listWardsQuerySchema = paginationQuerySchema.extend({
  municipalityId: z.string().uuid().optional(),
});

// --- Tole -----------------------------------------------------------
export const geoJsonPolygonSchema = z
  .object({
    type: z.literal('Polygon'),
    coordinates: z.array(z.array(z.tuple([z.number(), z.number()])).min(4)).min(1),
  })
  .describe('GeoJSON Polygon, [longitude, latitude] pairs, first == last point');

export const createToleSchema = z.object({
  wardId: z.string().uuid(),
  name: z.string().min(2).max(120),
  nameNepali: z.string().max(120).optional(),
  centerLat: z.number().min(-90).max(90).optional(),
  centerLng: z.number().min(-180).max(180).optional(),
  boundary: geoJsonPolygonSchema.optional(),
});
export const updateToleSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  nameNepali: z.string().max(120).nullable().optional(),
  centerLat: z.number().min(-90).max(90).nullable().optional(),
  centerLng: z.number().min(-180).max(180).nullable().optional(),
  boundary: geoJsonPolygonSchema.nullable().optional(),
});
export const listTolesQuerySchema = paginationQuerySchema.extend({
  wardId: z.string().uuid().optional(),
  search: z.string().trim().min(1).optional(),
});
