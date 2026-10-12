import { z } from 'zod';
import { paginationQuerySchema } from '../../utils/pagination';

export const listAuditLogsQuerySchema = paginationQuerySchema.extend({
  entityType: z.string().min(1).optional(),
  entityId: z.string().uuid().optional(),
  actorUserId: z.string().uuid().optional(),
  action: z.string().min(1).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
