import { z } from 'zod';
import {
  ContactMethod,
  ContactOutcome,
  FamilyRelationType,
  Gender,
  ImportJobStatus,
  ImportRowIssueType,
  VoterProbableParty,
  VoterStatus,
  VoterSupportLevel,
} from '@prisma/client';
import { paginationQuerySchema } from '../../utils/pagination';

export const idParamSchema = z.object({ id: z.string().uuid() });
export const relationshipParamSchema = z.object({ id: z.string().uuid(), relationshipId: z.string().uuid() });

const dateOfBirthSchema = z.coerce
  .date()
  .refine((d) => d.getTime() <= Date.now(), 'Date of birth cannot be in the future')
  .refine((d) => d.getTime() >= new Date('1900-01-01').getTime(), 'Date of birth is implausibly old');

export const createVoterSchema = z.object({
  wardId: z.string().uuid(),
  toleId: z.string().uuid().optional(),
  householdId: z.string().uuid().optional(),
  fullName: z.string().trim().min(2).max(150),
  dateOfBirth: dateOfBirthSchema,
  gender: z.nativeEnum(Gender).optional(),
  fatherOrSpouseName: z.string().max(150).optional(),
  citizenshipNumber: z.string().max(50).optional(),
  voterIdNumber: z.string().max(50).optional(),
  phone: z.string().max(20).optional(),
  occupation: z.string().max(100).optional(),
  address: z.string().max(250).optional(),
  supportLevel: z.nativeEnum(VoterSupportLevel).optional(),
  probableVoteParty: z.nativeEnum(VoterProbableParty).optional(),
});

export const updateVoterSchema = z.object({
  toleId: z.string().uuid().nullable().optional(),
  householdId: z.string().uuid().nullable().optional(),
  fullName: z.string().trim().min(2).max(150).optional(),
  dateOfBirth: dateOfBirthSchema.optional(),
  gender: z.nativeEnum(Gender).nullable().optional(),
  fatherOrSpouseName: z.string().max(150).nullable().optional(),
  citizenshipNumber: z.string().max(50).nullable().optional(),
  voterIdNumber: z.string().max(50).nullable().optional(),
  phone: z.string().max(20).nullable().optional(),
  occupation: z.string().max(100).nullable().optional(),
  address: z.string().max(250).nullable().optional(),
  status: z.nativeEnum(VoterStatus).optional(),
  supportLevel: z.nativeEnum(VoterSupportLevel).optional(),
  probableVoteParty: z.nativeEnum(VoterProbableParty).optional(),
});

export const listVotersQuerySchema = paginationQuerySchema.extend({
  wardId: z.string().uuid().optional(),
  toleId: z.string().uuid().optional(),
  householdId: z.string().uuid().optional(),
  gender: z.nativeEnum(Gender).optional(),
  status: z.nativeEnum(VoterStatus).optional(),
  supportLevel: z.nativeEnum(VoterSupportLevel).optional(),
  probableVoteParty: z.nativeEnum(VoterProbableParty).optional(),
  search: z.string().trim().min(1).optional(),
});

// --- Import ---------------------------------------------------------------

// multipart/form-data text fields arrive as strings on req.body; the file
// itself is handled separately by multer and read from req.file.
export const startImportSchema = z.object({
  wardId: z.string().uuid(),
  toleId: z.string().uuid().optional(),
});

export const importJobIdParamSchema = z.object({ id: z.string().uuid() });

export const listImportJobsQuerySchema = paginationQuerySchema.extend({
  wardId: z.string().uuid().optional(),
  status: z.nativeEnum(ImportJobStatus).optional(),
});

export const listImportIssuesQuerySchema = paginationQuerySchema.extend({
  issueType: z.nativeEnum(ImportRowIssueType).optional(),
});

// --- Contact history (append-only — no update/delete schemas) -------------

export const createContactSchema = z.object({
  method: z.nativeEnum(ContactMethod),
  outcome: z.nativeEnum(ContactOutcome),
  supportLevelObserved: z.nativeEnum(VoterSupportLevel).optional(),
  notes: z.string().max(1000).optional(),
  contactedAt: z.coerce
    .date()
    .refine((d) => d.getTime() <= Date.now(), 'contactedAt cannot be in the future')
    .optional(),
  canvassingVisitId: z.string().uuid().optional(),
});

export const listContactsQuerySchema = paginationQuerySchema.extend({
  method: z.nativeEnum(ContactMethod).optional(),
  outcome: z.nativeEnum(ContactOutcome).optional(),
});

// --- Family relationships (Module 09) — relatedVoterId must already exist;
// there is no "create a new voter inline" path here by design. ------------

export const createRelationshipSchema = z.object({
  relatedVoterId: z.string().uuid(),
  type: z.nativeEnum(FamilyRelationType),
});
