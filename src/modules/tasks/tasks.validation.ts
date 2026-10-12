import { z } from 'zod';
import { TaskStatus, VisitOutcome } from '@prisma/client';
import { paginationQuerySchema } from '../../utils/pagination';
import { TASK_MAX_HOUSEHOLDS } from './tasks.service';

export const idParamSchema = z.object({ id: z.string().uuid() });
export const visitParamSchema = z.object({ id: z.string().uuid(), visitId: z.string().uuid() });

export const createTaskSchema = z.object({
  wardId: z.string().uuid(),
  toleId: z.string().uuid().optional(),
  title: z.string().trim().min(2).max(150),
  description: z.string().max(2000).optional(),
  dueDate: z.coerce.date().optional(),
  assignedToId: z.string().uuid(),
  householdIds: z.array(z.string().uuid()).min(1).max(TASK_MAX_HOUSEHOLDS).optional(),
});

export const updateTaskSchema = z.object({
  title: z.string().trim().min(2).max(150).optional(),
  description: z.string().max(2000).nullable().optional(),
  dueDate: z.coerce.date().nullable().optional(),
  assignedToId: z.string().uuid().optional(),
  status: z.nativeEnum(TaskStatus).optional(),
});

export const listTasksQuerySchema = paginationQuerySchema.extend({
  wardId: z.string().uuid().optional(),
  toleId: z.string().uuid().optional(),
  assignedToId: z.string().uuid().optional(),
  status: z.nativeEnum(TaskStatus).optional(),
});

export const updateVisitSchema = z.object({
  outcome: z.nativeEnum(VisitOutcome),
  notes: z.string().max(1000).optional(),
});

export const listVisitsQuerySchema = paginationQuerySchema.extend({
  outcome: z.nativeEnum(VisitOutcome).optional(),
});
