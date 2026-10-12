import { z } from 'zod';

export const dashboardQuerySchema = z.object({
  wardId: z.string().uuid().optional(),
  toleId: z.string().uuid().optional(),
});
