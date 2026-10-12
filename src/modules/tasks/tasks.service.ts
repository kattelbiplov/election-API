import { Prisma, TaskStatus, UserRole, UserStatus, VisitOutcome } from '@prisma/client';
import { prisma } from '../../config/db';
import { ApiError } from '../../utils/ApiError';
import { PaginationQuery, toSkipTake } from '../../utils/pagination';
import { assertGeoScopeAccess, getAccessibleGeoScope } from '../../middleware/geoScope';

interface ActingUser {
  id: string;
  organizationId: string;
  role: UserRole;
}

// The two roles that actually do door-to-door work — see the design note at
// the top of the Module 04 section in prisma/schema.prisma.
const WORKER_ROLES: UserRole[] = [UserRole.FIELD_WORKER, UserRole.VOLUNTEER];

export const TASK_MAX_HOUSEHOLDS = 500;

async function assertToleBelongsToWard(organizationId: string, wardId: string, toleId?: string): Promise<void> {
  if (!toleId) return;
  const tole = await prisma.tole.findUnique({ where: { id: toleId } });
  if (!tole || tole.organizationId !== organizationId) {
    throw ApiError.badRequest('Tole not found in your organization');
  }
  if (tole.wardId !== wardId) {
    throw ApiError.badRequest('Tole does not belong to the given ward');
  }
}

// A task's assignee must be a FIELD_WORKER/VOLUNTEER, active, in the same
// org, and already have a UserGeoAssignment covering the task's ward/tole —
// assigning a task requires that access exists, it doesn't grant it.
async function validateAssignee(
  assignedToId: string,
  organizationId: string,
  wardId: string,
  toleId?: string | null,
) {
  const assignee = await prisma.user.findUnique({ where: { id: assignedToId } });
  if (!assignee || assignee.organizationId !== organizationId || assignee.deletedAt) {
    throw ApiError.badRequest('Assignee not found in your organization');
  }
  if (!WORKER_ROLES.includes(assignee.role)) {
    throw ApiError.badRequest('Tasks can only be assigned to a FIELD_WORKER or VOLUNTEER');
  }
  if (assignee.status !== UserStatus.ACTIVE) {
    throw ApiError.badRequest('Assignee is not an active user');
  }
  await assertGeoScopeAccess({ id: assignee.id, role: assignee.role }, { wardId, toleId });
  return assignee;
}

// Throws 403/404 unless `actor` may see this task: a worker only sees tasks
// assigned to them (not just "in their tole" — assertGeoScopeAccess alone
// would let a FIELD_WORKER see a colleague's task in the same tole); every
// other role goes through the usual geo-scope check.
async function assertTaskAccess(
  actor: ActingUser,
  task: { wardId: string; toleId: string | null; assignedToId: string },
): Promise<void> {
  if (WORKER_ROLES.includes(actor.role)) {
    if (task.assignedToId !== actor.id) {
      throw ApiError.forbidden('This task is not assigned to you');
    }
    return;
  }
  await assertGeoScopeAccess(actor, { wardId: task.wardId, toleId: task.toleId });
}

interface VisitSummary {
  total: number;
  pending: number;
  visited: number;
  notHome: number;
  refused: number;
  invalidAddress: number;
}

const EMPTY_SUMMARY: VisitSummary = { total: 0, pending: 0, visited: 0, notHome: 0, refused: 0, invalidAddress: 0 };

async function computeVisitSummaries(taskIds: string[]): Promise<Map<string, VisitSummary>> {
  const map = new Map<string, VisitSummary>();
  if (taskIds.length === 0) return map;

  const counts = await prisma.canvassingVisit.groupBy({
    by: ['taskId', 'outcome'],
    where: { taskId: { in: taskIds } },
    _count: { _all: true },
  });

  for (const row of counts) {
    const summary = map.get(row.taskId) ?? { ...EMPTY_SUMMARY };
    const n = row._count._all;
    summary.total += n;
    if (row.outcome === VisitOutcome.PENDING) summary.pending += n;
    else if (row.outcome === VisitOutcome.VISITED) summary.visited += n;
    else if (row.outcome === VisitOutcome.NOT_HOME) summary.notHome += n;
    else if (row.outcome === VisitOutcome.REFUSED) summary.refused += n;
    else if (row.outcome === VisitOutcome.INVALID_ADDRESS) summary.invalidAddress += n;
    map.set(row.taskId, summary);
  }
  return map;
}

// Auto-derives PENDING -> IN_PROGRESS -> COMPLETED from visit outcomes after
// every visit update; never resurrects a CANCELLED task. Naturally reverts
// COMPLETED back to IN_PROGRESS if a visit is corrected back to PENDING.
async function recomputeTaskStatus(tx: Prisma.TransactionClient, taskId: string): Promise<void> {
  const task = await tx.canvassingTask.findUnique({ where: { id: taskId }, select: { status: true } });
  if (!task || task.status === TaskStatus.CANCELLED) return;

  const counts = await tx.canvassingVisit.groupBy({
    by: ['outcome'],
    where: { taskId },
    _count: { _all: true },
  });
  const total = counts.reduce((sum, c) => sum + c._count._all, 0);
  const pending = counts.find((c) => c.outcome === VisitOutcome.PENDING)?._count._all ?? 0;

  const nextStatus =
    total > 0 && pending === 0
      ? TaskStatus.COMPLETED
      : pending < total
        ? TaskStatus.IN_PROGRESS
        : TaskStatus.PENDING;

  if (nextStatus !== task.status) {
    await tx.canvassingTask.update({ where: { id: taskId }, data: { status: nextStatus } });
  }
}

const ASSIGNEE_SELECT = { id: true, name: true, email: true, role: true } as const;

interface CreateTaskInput {
  wardId: string;
  toleId?: string;
  title: string;
  description?: string;
  dueDate?: Date;
  assignedToId: string;
  householdIds?: string[];
}

export async function createTask(actor: ActingUser, input: CreateTaskInput) {
  const ward = await prisma.ward.findUnique({ where: { id: input.wardId } });
  if (!ward) throw ApiError.badRequest('Ward not found');

  await assertToleBelongsToWard(actor.organizationId, input.wardId, input.toleId);
  await assertGeoScopeAccess(actor, { wardId: input.wardId, toleId: input.toleId });
  await validateAssignee(input.assignedToId, actor.organizationId, input.wardId, input.toleId);

  let households: { id: string }[];
  if (input.householdIds && input.householdIds.length > 0) {
    households = await prisma.household.findMany({
      where: {
        id: { in: input.householdIds },
        organizationId: actor.organizationId,
        wardId: input.wardId,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (households.length !== new Set(input.householdIds).size) {
      throw ApiError.badRequest('One or more households were not found in this ward');
    }
  } else {
    households = await prisma.household.findMany({
      where: {
        organizationId: actor.organizationId,
        wardId: input.wardId,
        ...(input.toleId ? { toleId: input.toleId } : {}),
        deletedAt: null,
      },
      select: { id: true },
    });
  }

  if (households.length === 0) {
    throw ApiError.badRequest(
      'No households match this task — pass householdIds explicitly, or add households to this area first',
    );
  }
  if (households.length > TASK_MAX_HOUSEHOLDS) {
    throw ApiError.badRequest(
      `This task would cover ${households.length} households, which exceeds the ${TASK_MAX_HOUSEHOLDS}-household limit — narrow the scope or pass an explicit householdIds list`,
    );
  }

  const task = await prisma.$transaction(async (tx) => {
    const created = await tx.canvassingTask.create({
      data: {
        organizationId: actor.organizationId,
        wardId: input.wardId,
        toleId: input.toleId,
        title: input.title,
        description: input.description,
        dueDate: input.dueDate,
        assignedToId: input.assignedToId,
        createdById: actor.id,
      },
    });
    await tx.canvassingVisit.createMany({
      data: households.map((h) => ({ taskId: created.id, householdId: h.id })),
    });
    return created;
  });

  return getTaskById(actor, task.id);
}

interface ListTasksQuery extends PaginationQuery {
  wardId?: string;
  toleId?: string;
  assignedToId?: string;
  status?: TaskStatus;
}

export async function listTasks(actor: ActingUser, query: ListTasksQuery) {
  const isWorker = WORKER_ROLES.includes(actor.role);
  // Workers only ever see their own tasks — any assignedToId they pass is
  // ignored, not just defaulted, so they can't browse a colleague's queue.
  const assignedToId = isWorker ? actor.id : query.assignedToId;
  const scope = isWorker ? null : await getAccessibleGeoScope(actor);

  const where: Prisma.CanvassingTaskWhereInput = {
    organizationId: actor.organizationId,
    deletedAt: null,
    ...(scope ? { OR: [{ wardId: { in: scope.wardIds } }, { toleId: { in: scope.toleIds } }] } : {}),
    ...(query.wardId ? { wardId: query.wardId } : {}),
    ...(query.toleId ? { toleId: query.toleId } : {}),
    ...(assignedToId ? { assignedToId } : {}),
    ...(query.status ? { status: query.status } : {}),
  };

  const [items, totalItems] = await Promise.all([
    prisma.canvassingTask.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      ...toSkipTake(query),
      include: { assignedTo: { select: ASSIGNEE_SELECT } },
    }),
    prisma.canvassingTask.count({ where }),
  ]);

  const summaries = await computeVisitSummaries(items.map((t) => t.id));
  return {
    items: items.map((t) => ({ ...t, visitSummary: summaries.get(t.id) ?? EMPTY_SUMMARY })),
    totalItems,
  };
}

export async function getTaskById(actor: ActingUser, id: string) {
  const task = await prisma.canvassingTask.findFirst({
    where: { id, organizationId: actor.organizationId, deletedAt: null },
    include: {
      ward: true,
      tole: true,
      assignedTo: { select: ASSIGNEE_SELECT },
    },
  });
  if (!task) throw ApiError.notFound('Task not found');
  await assertTaskAccess(actor, task);

  const summaries = await computeVisitSummaries([task.id]);
  return { ...task, visitSummary: summaries.get(task.id) ?? EMPTY_SUMMARY };
}

interface UpdateTaskInput {
  title?: string;
  description?: string | null;
  dueDate?: Date | null;
  assignedToId?: string;
  status?: TaskStatus;
}

export async function updateTask(actor: ActingUser, id: string, input: UpdateTaskInput) {
  const task = await prisma.canvassingTask.findFirst({
    where: { id, organizationId: actor.organizationId, deletedAt: null },
  });
  if (!task) throw ApiError.notFound('Task not found');
  await assertGeoScopeAccess(actor, { wardId: task.wardId, toleId: task.toleId });

  if (input.assignedToId) {
    await validateAssignee(input.assignedToId, actor.organizationId, task.wardId, task.toleId);
  }

  await prisma.canvassingTask.update({ where: { id }, data: input as Prisma.CanvassingTaskUpdateInput });
  return getTaskById(actor, id);
}

export async function deleteTask(actor: ActingUser, id: string): Promise<void> {
  const task = await prisma.canvassingTask.findFirst({
    where: { id, organizationId: actor.organizationId, deletedAt: null },
  });
  if (!task) throw ApiError.notFound('Task not found');
  await assertGeoScopeAccess(actor, { wardId: task.wardId, toleId: task.toleId });
  await prisma.canvassingTask.update({ where: { id }, data: { deletedAt: new Date() } });
}

interface ListVisitsQuery extends PaginationQuery {
  outcome?: VisitOutcome;
}

export async function listVisits(actor: ActingUser, taskId: string, query: ListVisitsQuery) {
  await getTaskById(actor, taskId); // authorizes (incl. worker "assigned to me") + 404s

  const where: Prisma.CanvassingVisitWhereInput = {
    taskId,
    ...(query.outcome ? { outcome: query.outcome } : {}),
  };

  const [items, totalItems] = await Promise.all([
    prisma.canvassingVisit.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      ...toSkipTake(query),
      include: { household: true },
    }),
    prisma.canvassingVisit.count({ where }),
  ]);

  return { items, totalItems };
}

interface UpdateVisitInput {
  outcome: VisitOutcome;
  notes?: string;
}

export async function updateVisit(actor: ActingUser, taskId: string, visitId: string, input: UpdateVisitInput) {
  const task = await getTaskById(actor, taskId); // authorizes + 404s
  if (task.status === TaskStatus.CANCELLED) {
    throw ApiError.badRequest('Cannot update visits on a cancelled task');
  }

  const visit = await prisma.canvassingVisit.findFirst({ where: { id: visitId, taskId } });
  if (!visit) throw ApiError.notFound('Visit not found');

  return prisma.$transaction(async (tx) => {
    const updated = await tx.canvassingVisit.update({
      where: { id: visitId },
      data: {
        outcome: input.outcome,
        notes: input.notes,
        visitedAt: input.outcome === VisitOutcome.PENDING ? null : new Date(),
        visitedById: actor.id,
      },
    });
    await recomputeTaskStatus(tx, taskId);
    return updated;
  });
}
