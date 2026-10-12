import { z } from 'zod';
import { Gender, UserRole, UserStatus } from '@prisma/client';
import { paginationQuerySchema } from '../../utils/pagination';

// Bio fields are optional for every role but mainly meaningful for
// VOLUNTEER/FIELD_WORKER accounts — see the design note on User in
// prisma/schema.prisma.
const dateOfBirthSchema = z.coerce
  .date()
  .refine((d) => d.getTime() <= Date.now(), 'Date of birth cannot be in the future')
  .refine((d) => d.getTime() >= new Date('1900-01-01').getTime(), 'Date of birth is implausibly old');

export const createUserSchema = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email(),
  phone: z.string().min(7).max(20).optional(),
  password: z.string().min(10),
  role: z.nativeEnum(UserRole),
  address: z.string().max(250).optional(),
  dateOfBirth: dateOfBirthSchema.optional(),
  gender: z.nativeEnum(Gender).optional(),
});

export const updateUserSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  phone: z.string().min(7).max(20).nullable().optional(),
  role: z.nativeEnum(UserRole).optional(),
  status: z.nativeEnum(UserStatus).optional(),
  address: z.string().max(250).nullable().optional(),
  dateOfBirth: dateOfBirthSchema.nullable().optional(),
  gender: z.nativeEnum(Gender).nullable().optional(),
});

export const listUsersQuerySchema = paginationQuerySchema.extend({
  role: z.nativeEnum(UserRole).optional(),
  status: z.nativeEnum(UserStatus).optional(),
  search: z.string().trim().min(1).optional(),
  wardId: z.string().uuid().optional(),
});

export const userIdParamSchema = z.object({ id: z.string().uuid() });

export const removeAssignmentParamSchema = z.object({
  id: z.string().uuid(),
  assignmentId: z.string().uuid(),
});

export const assignGeoSchema = z
  .object({
    wardId: z.string().uuid(),
    toleId: z.string().uuid().optional(),
  })
  .strict();
