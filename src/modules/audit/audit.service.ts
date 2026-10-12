import { Prisma, UserRole } from '@prisma/client';
import { prisma } from '../../config/db';
import { PaginationQuery, toSkipTake } from '../../utils/pagination';

interface ActingUser {
  organizationId: string;
  role: UserRole;
}

interface ListAuditLogsQuery extends PaginationQuery {
  entityType?: string;
  entityId?: string;
  actorUserId?: string;
  action?: string;
  from?: Date;
  to?: Date;
}

export async function listAuditLogs(actor: ActingUser, query: ListAuditLogsQuery) {
  // SUPER_ADMIN sees platform-wide logs (organizationId omitted); every other
  // role is confined to its own organization's history.
  const where: Prisma.AuditLogWhereInput = {
    ...(actor.role === UserRole.SUPER_ADMIN ? {} : { organizationId: actor.organizationId }),
    ...(query.entityType ? { entityType: query.entityType } : {}),
    ...(query.entityId ? { entityId: query.entityId } : {}),
    ...(query.actorUserId ? { actorUserId: query.actorUserId } : {}),
    ...(query.action ? { action: query.action } : {}),
    ...(query.from || query.to
      ? { createdAt: { ...(query.from ? { gte: query.from } : {}), ...(query.to ? { lte: query.to } : {}) } }
      : {}),
  };

  const [items, totalItems] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      ...toSkipTake(query),
      include: { actor: { select: { id: true, name: true, email: true, role: true } } },
    }),
    prisma.auditLog.count({ where }),
  ]);

  return { items, totalItems };
}
