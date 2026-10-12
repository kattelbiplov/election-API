import { z } from 'zod';
import { paginationQuerySchema } from '../../utils/pagination';

const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const createOrganizationSchema = z.object({
  name: z.string().min(2).max(120),
  slug: z.string().min(2).max(60).regex(slugRegex, 'slug must be lowercase kebab-case'),
  adminName: z.string().min(2).max(120),
  adminEmail: z.string().email(),
  adminPassword: z.string().min(10),
});

export const updateOrganizationSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  status: z.enum(['ACTIVE', 'SUSPENDED']).optional(),
});

export const listOrganizationsQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().min(1).optional(),
});

export const orgIdParamSchema = z.object({ id: z.string().uuid() });
