import { z } from 'zod';
import { paginationQuerySchema } from '../../utils/pagination';
import { geoJsonPolygonSchema } from '../geo/geo.validation';
import { NEARBY_MAX_RADIUS_METERS } from './households.geo';

export const idParamSchema = z.object({ id: z.string().uuid() });

export const createHouseholdSchema = z.object({
  wardId: z.string().uuid(),
  toleId: z.string().uuid().optional(),
  address: z.string().min(2).max(250),
  landmark: z.string().max(150).optional(),
  centerLat: z.number().min(-90).max(90).optional(),
  centerLng: z.number().min(-180).max(180).optional(),
});

export const updateHouseholdSchema = z.object({
  toleId: z.string().uuid().nullable().optional(),
  address: z.string().min(2).max(250).optional(),
  landmark: z.string().max(150).nullable().optional(),
  centerLat: z.number().min(-90).max(90).nullable().optional(),
  centerLng: z.number().min(-180).max(180).nullable().optional(),
  // Module 09 (household family tree): must be a Voter already linked to
  // this household (voter.householdId === this household's id) — validated
  // in households.service.ts, not here.
  headOfHouseholdId: z.string().uuid().nullable().optional(),
});

export const listHouseholdsQuerySchema = paginationQuerySchema.extend({
  wardId: z.string().uuid().optional(),
  toleId: z.string().uuid().optional(),
  search: z.string().trim().min(1).optional(),
});

// --- GIS (docs/modules/03-household-gis.md) ---

export const nearbyHouseholdsQuerySchema = paginationQuerySchema.extend({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  radiusMeters: z.coerce.number().positive().max(NEARBY_MAX_RADIUS_METERS).default(500),
  wardId: z.string().uuid().optional(),
});

export const withinPolygonBodySchema = z.object({
  wardId: z.string().uuid(),
  polygon: geoJsonPolygonSchema,
});

export const withinPolygonQuerySchema = paginationQuerySchema;
