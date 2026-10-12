import { Request } from 'express';
import { prisma } from '../config/db';
import { logger } from '../config/logger';

interface RecordAuditParams {
  req: Request;
  action: string; // "user.create", "ward.update", "auth.login", ...
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
}

// Fire-and-forget-safe audit writer. Every mutating endpoint (and auth events)
// calls this after the operation succeeds. Failure to write an audit row must
// never fail the request, so errors are logged, not thrown — but it is awaited
// by callers so ordering relative to the response is predictable in tests.
export async function recordAudit({
  req,
  action,
  entityType,
  entityId,
  before,
  after,
}: RecordAuditParams): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        organizationId: req.user?.organizationId ?? null,
        actorUserId: req.user?.id ?? null,
        action,
        entityType,
        entityId: entityId ?? null,
        before: before === undefined ? undefined : (before as object),
        after: after === undefined ? undefined : (after as object),
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'] ?? null,
      },
    });
  } catch (err) {
    logger.error({ err, action, entityType }, 'Failed to write audit log');
  }
}
