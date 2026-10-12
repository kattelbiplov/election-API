import {
  ContactMethod,
  ContactOutcome,
  FamilyRelationType,
  Gender,
  ImportJobStatus,
  ImportRowIssueType,
  Prisma,
  UserRole,
  VoterSource,
  VoterSupportLevel,
} from '@prisma/client';
import { prisma } from '../../config/db';
import { ApiError } from '../../utils/ApiError';
import { PaginationQuery, toSkipTake } from '../../utils/pagination';
import { assertGeoScopeAccess, getAccessibleGeoScope } from '../../middleware/geoScope';
import { IMPORT_MAX_ROWS, parseImportFile, validateImportRow } from './voters.import';

interface ActingUser {
  id: string;
  organizationId: string;
  role: UserRole;
}

// Lowercased, whitespace-collapsed — the name half of the dedup key. See the
// design note at the top of the Module 02 section in prisma/schema.prisma.
export function normalizeVoterName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

function voterDedupKey(normalizedName: string, dateOfBirth: Date): string {
  return `${normalizedName}|${dateOfBirth.toISOString().slice(0, 10)}`;
}

async function assertToleBelongsToWard(actor: ActingUser, wardId: string, toleId?: string | null): Promise<void> {
  if (!toleId) return;
  const tole = await prisma.tole.findUnique({ where: { id: toleId } });
  if (!tole || tole.organizationId !== actor.organizationId) {
    throw ApiError.badRequest('Tole not found in your organization');
  }
  if (tole.wardId !== wardId) {
    throw ApiError.badRequest('Tole does not belong to the given ward');
  }
}

async function assertHouseholdBelongsToWard(
  actor: ActingUser,
  wardId: string,
  householdId?: string | null,
): Promise<void> {
  if (!householdId) return;
  const household = await prisma.household.findUnique({ where: { id: householdId } });
  if (!household || household.organizationId !== actor.organizationId || household.deletedAt) {
    throw ApiError.badRequest('Household not found in your organization');
  }
  if (household.wardId !== wardId) {
    throw ApiError.badRequest('Household does not belong to the given ward');
  }
}

// ============================= CRUD =============================

interface CreateVoterInput {
  wardId: string;
  toleId?: string;
  householdId?: string;
  fullName: string;
  dateOfBirth: Date;
  gender?: Gender;
  fatherOrSpouseName?: string;
  citizenshipNumber?: string;
  voterIdNumber?: string;
  phone?: string;
  occupation?: string;
  address?: string;
  supportLevel?: VoterSupportLevel;
}

export async function createVoter(actor: ActingUser, input: CreateVoterInput) {
  const ward = await prisma.ward.findUnique({ where: { id: input.wardId } });
  if (!ward) throw ApiError.badRequest('Ward not found');

  await assertToleBelongsToWard(actor, input.wardId, input.toleId);
  await assertHouseholdBelongsToWard(actor, input.wardId, input.householdId);
  await assertGeoScopeAccess(actor, { wardId: input.wardId, toleId: input.toleId });

  const normalizedName = normalizeVoterName(input.fullName);
  const existing = await prisma.voter.findFirst({
    where: {
      organizationId: actor.organizationId,
      wardId: input.wardId,
      normalizedName,
      dateOfBirth: input.dateOfBirth,
      deletedAt: null,
    },
  });
  if (existing) {
    throw ApiError.conflict('A voter with this name and date of birth already exists in this ward');
  }

  return prisma.voter.create({
    data: {
      organizationId: actor.organizationId,
      wardId: input.wardId,
      toleId: input.toleId,
      householdId: input.householdId,
      fullName: input.fullName.trim(),
      normalizedName,
      dateOfBirth: input.dateOfBirth,
      gender: input.gender,
      fatherOrSpouseName: input.fatherOrSpouseName,
      citizenshipNumber: input.citizenshipNumber,
      voterIdNumber: input.voterIdNumber,
      phone: input.phone,
      occupation: input.occupation,
      address: input.address,
      supportLevel: input.supportLevel,
      source: VoterSource.MANUAL,
      createdById: actor.id,
    },
  });
}

interface ListVotersQuery extends PaginationQuery {
  wardId?: string;
  toleId?: string;
  householdId?: string;
  gender?: Gender;
  status?: string;
  supportLevel?: VoterSupportLevel;
  search?: string;
}

export async function listVoters(actor: ActingUser, query: ListVotersQuery) {
  const scope = await getAccessibleGeoScope(actor);

  const where: Prisma.VoterWhereInput = {
    organizationId: actor.organizationId,
    deletedAt: null,
    ...(scope ? { OR: [{ wardId: { in: scope.wardIds } }, { toleId: { in: scope.toleIds } }] } : {}),
    ...(query.wardId ? { wardId: query.wardId } : {}),
    ...(query.toleId ? { toleId: query.toleId } : {}),
    ...(query.householdId ? { householdId: query.householdId } : {}),
    ...(query.gender ? { gender: query.gender } : {}),
    ...(query.status ? { status: query.status as never } : {}),
    ...(query.supportLevel ? { supportLevel: query.supportLevel } : {}),
    ...(query.probableVoteParty ? { probableVoteParty: query.probableVoteParty } : {}),
    ...(query.search ? { fullName: { contains: query.search, mode: 'insensitive' } } : {}),
  };

  const [items, totalItems] = await Promise.all([
    prisma.voter.findMany({ where, orderBy: { fullName: 'asc' }, ...toSkipTake(query) }),
    prisma.voter.count({ where }),
  ]);

  return { items, totalItems };
}

export async function getVoterById(actor: ActingUser, id: string) {
  const voter = await prisma.voter.findFirst({
    where: { id, organizationId: actor.organizationId, deletedAt: null },
    include: { ward: true, tole: true, household: true },
  });
  if (!voter) throw ApiError.notFound('Voter not found');
  await assertGeoScopeAccess(actor, { wardId: voter.wardId, toleId: voter.toleId });
  return voter;
}

interface UpdateVoterInput {
  toleId?: string | null;
  householdId?: string | null;
  fullName?: string;
  dateOfBirth?: Date;
  gender?: Gender | null;
  fatherOrSpouseName?: string | null;
  citizenshipNumber?: string | null;
  voterIdNumber?: string | null;
  phone?: string | null;
  occupation?: string | null;
  address?: string | null;
  status?: 'ACTIVE' | 'DECEASED' | 'MOVED';
  supportLevel?: VoterSupportLevel;
}

export async function updateVoter(actor: ActingUser, id: string, input: UpdateVoterInput) {
  const voter = await getVoterById(actor, id);

  if (input.toleId) {
    await assertToleBelongsToWard(actor, voter.wardId, input.toleId);
    await assertGeoScopeAccess(actor, { wardId: voter.wardId, toleId: input.toleId });
  }
  if (input.householdId) {
    await assertHouseholdBelongsToWard(actor, voter.wardId, input.householdId);
  }

  const data: Prisma.VoterUpdateInput = { ...input };

  if (input.fullName || input.dateOfBirth) {
    const fullName = input.fullName ?? voter.fullName;
    const dateOfBirth = input.dateOfBirth ?? voter.dateOfBirth;
    const normalizedName = normalizeVoterName(fullName);

    const clash = await prisma.voter.findFirst({
      where: {
        id: { not: voter.id },
        organizationId: actor.organizationId,
        wardId: voter.wardId,
        normalizedName,
        dateOfBirth,
        deletedAt: null,
      },
    });
    if (clash) {
      throw ApiError.conflict('Another voter with this name and date of birth already exists in this ward');
    }
    data.normalizedName = normalizedName;
  }

  return prisma.voter.update({ where: { id }, data });
}

export async function deleteVoter(actor: ActingUser, id: string): Promise<void> {
  const voter = await getVoterById(actor, id);
  await prisma.voter.update({ where: { id: voter.id }, data: { deletedAt: new Date() } });
}

// ============================= Import =============================

interface StartImportInput {
  wardId: string;
  toleId?: string;
  file: { buffer: Buffer; originalname: string; mimetype: string; size: number };
}

export async function runVoterImport(actor: ActingUser, input: StartImportInput) {
  const ward = await prisma.ward.findUnique({ where: { id: input.wardId } });
  if (!ward) throw ApiError.badRequest('Ward not found');

  await assertToleBelongsToWard(actor, input.wardId, input.toleId);
  await assertGeoScopeAccess(actor, { wardId: input.wardId, toleId: input.toleId });

  const rawRows = await parseImportFile(input.file.buffer, input.file.originalname, input.file.mimetype);
  if (rawRows.length === 0) {
    throw ApiError.badRequest('File contains no data rows');
  }
  if (rawRows.length > IMPORT_MAX_ROWS) {
    throw ApiError.badRequest(
      `File has ${rawRows.length} rows, which exceeds the ${IMPORT_MAX_ROWS}-row limit per import`,
    );
  }

  const job = await prisma.voterImportJob.create({
    data: {
      organizationId: actor.organizationId,
      wardId: input.wardId,
      toleId: input.toleId,
      fileName: input.file.originalname,
      fileSizeBytes: input.file.size,
      uploadedById: actor.id,
      totalRows: rawRows.length,
      status: ImportJobStatus.PROCESSING,
    },
  });

  // Preload existing dedup keys for this ward once instead of a query per row.
  const existingVoters = await prisma.voter.findMany({
    where: { organizationId: actor.organizationId, wardId: input.wardId, deletedAt: null },
    select: { normalizedName: true, dateOfBirth: true },
  });
  const seenKeys = new Set(existingVoters.map((v) => voterDedupKey(v.normalizedName, v.dateOfBirth)));

  const toleCache = new Map<string, string>();
  async function resolveTole(name: string): Promise<string> {
    const cacheKey = name.toLowerCase();
    const cached = toleCache.get(cacheKey);
    if (cached) return cached;

    let tole = await prisma.tole.findFirst({
      where: {
        organizationId: actor.organizationId,
        wardId: input.wardId,
        name: { equals: name, mode: 'insensitive' },
        deletedAt: null,
      },
    });
    // Tole names are informal/campaign-defined (see Module 01 doc) — auto-create
    // rather than reject the row, so a typo-free but previously-unseen tole
    // name doesn't block an otherwise-valid import.
    if (!tole) {
      tole = await prisma.tole.create({
        data: { organizationId: actor.organizationId, wardId: input.wardId, name, createdById: actor.id },
      });
    }
    toleCache.set(cacheKey, tole.id);
    return tole.id;
  }

  let importedRows = 0;
  let duplicateRows = 0;
  let errorRows = 0;
  const issues: Prisma.VoterImportRowIssueCreateManyInput[] = [];

  for (let i = 0; i < rawRows.length; i++) {
    const rowNumber = i + 1; // 1-based, data rows only (header row excluded)
    const raw = rawRows[i];
    const rawData = raw as Prisma.InputJsonValue;
    const result = validateImportRow(raw);

    if ('error' in result) {
      errorRows++;
      issues.push({ importJobId: job.id, rowNumber, issueType: ImportRowIssueType.VALIDATION_ERROR, message: result.error, rawData });
      continue;
    }

    const { data } = result;
    const normalizedName = normalizeVoterName(data.fullName);
    const key = voterDedupKey(normalizedName, data.dateOfBirth);

    if (seenKeys.has(key)) {
      duplicateRows++;
      issues.push({
        importJobId: job.id,
        rowNumber,
        issueType: ImportRowIssueType.DUPLICATE,
        message: 'Matches an existing voter (same name + date of birth already in this ward)',
        rawData,
      });
      continue;
    }

    let toleId: string | null = input.toleId ?? null;
    if (data.toleName) {
      toleId = await resolveTole(data.toleName);
    }

    try {
      await prisma.voter.create({
        data: {
          organizationId: actor.organizationId,
          wardId: input.wardId,
          toleId,
          fullName: data.fullName,
          normalizedName,
          dateOfBirth: data.dateOfBirth,
          gender: data.gender,
          fatherOrSpouseName: data.fatherOrSpouseName,
          citizenshipNumber: data.citizenshipNumber,
          voterIdNumber: data.voterIdNumber,
          phone: data.phone,
          occupation: data.occupation,
          address: data.address,
          source: VoterSource.IMPORT,
          importJobId: job.id,
          importRowNumber: rowNumber,
          createdById: actor.id,
        },
      });
      importedRows++;
      seenKeys.add(key);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        duplicateRows++;
        issues.push({
          importJobId: job.id,
          rowNumber,
          issueType: ImportRowIssueType.DUPLICATE,
          message: 'Matches an existing voter (detected at insert time)',
          rawData,
        });
      } else {
        errorRows++;
        issues.push({
          importJobId: job.id,
          rowNumber,
          issueType: ImportRowIssueType.VALIDATION_ERROR,
          message: `Unexpected error while saving row: ${(err as Error).message}`,
          rawData,
        });
      }
    }
  }

  if (issues.length > 0) {
    await prisma.voterImportRowIssue.createMany({ data: issues });
  }

  const status =
    importedRows === 0
      ? ImportJobStatus.FAILED
      : errorRows > 0 || duplicateRows > 0
        ? ImportJobStatus.COMPLETED_WITH_ERRORS
        : ImportJobStatus.COMPLETED;

  return prisma.voterImportJob.update({
    where: { id: job.id },
    data: { status, importedRows, duplicateRows, errorRows, completedAt: new Date() },
  });
}

interface ListImportJobsQuery extends PaginationQuery {
  wardId?: string;
  status?: ImportJobStatus;
}

export async function listImportJobs(actor: ActingUser, query: ListImportJobsQuery) {
  const scope = await getAccessibleGeoScope(actor);

  const where: Prisma.VoterImportJobWhereInput = {
    organizationId: actor.organizationId,
    ...(scope ? { OR: [{ wardId: { in: scope.wardIds } }, { toleId: { in: scope.toleIds } }] } : {}),
    ...(query.wardId ? { wardId: query.wardId } : {}),
    ...(query.status ? { status: query.status } : {}),
  };

  const [items, totalItems] = await Promise.all([
    prisma.voterImportJob.findMany({ where, orderBy: { startedAt: 'desc' }, ...toSkipTake(query) }),
    prisma.voterImportJob.count({ where }),
  ]);

  return { items, totalItems };
}

export async function getImportJobById(actor: ActingUser, id: string) {
  const job = await prisma.voterImportJob.findFirst({ where: { id, organizationId: actor.organizationId } });
  if (!job) throw ApiError.notFound('Import job not found');
  await assertGeoScopeAccess(actor, { wardId: job.wardId, toleId: job.toleId });
  return job;
}

interface ListImportIssuesQuery extends PaginationQuery {
  issueType?: ImportRowIssueType;
}

export async function listImportIssues(actor: ActingUser, jobId: string, query: ListImportIssuesQuery) {
  await getImportJobById(actor, jobId);

  const where: Prisma.VoterImportRowIssueWhereInput = {
    importJobId: jobId,
    ...(query.issueType ? { issueType: query.issueType } : {}),
  };

  const [items, totalItems] = await Promise.all([
    prisma.voterImportRowIssue.findMany({ where, orderBy: { rowNumber: 'asc' }, ...toSkipTake(query) }),
    prisma.voterImportRowIssue.count({ where }),
  ]);

  return { items, totalItems };
}

// ============================= Contact history =============================
// Append-only — see the design note on VoterContact in prisma/schema.prisma.
// No update/delete: correcting a wrong entry means logging a new one.

interface CreateContactInput {
  method: ContactMethod;
  outcome: ContactOutcome;
  supportLevelObserved?: VoterSupportLevel;
  notes?: string;
  contactedAt?: Date;
  canvassingVisitId?: string;
}

async function assertCanvassingVisitMatchesVoter(
  organizationId: string,
  canvassingVisitId: string,
  voterHouseholdId: string | null,
): Promise<void> {
  const visit = await prisma.canvassingVisit.findUnique({
    where: { id: canvassingVisitId },
    include: { task: { select: { organizationId: true } } },
  });
  if (!visit || visit.task.organizationId !== organizationId) {
    throw ApiError.badRequest('Canvassing visit not found in your organization');
  }
  if (voterHouseholdId && visit.householdId !== voterHouseholdId) {
    throw ApiError.badRequest("This canvassing visit does not correspond to this voter's household");
  }
}

export async function createContact(actor: ActingUser, voterId: string, input: CreateContactInput) {
  const voter = await getVoterById(actor, voterId); // authorizes + 404s

  if (input.canvassingVisitId) {
    await assertCanvassingVisitMatchesVoter(actor.organizationId, input.canvassingVisitId, voter.householdId);
  }

  // supportLevelObserved (if given) also updates the voter's current
  // classification in the same transaction, so the log and Voter.supportLevel
  // can't drift apart — same philosophy as CanvassingTask.status being
  // recomputed from visit outcomes.
  return prisma.$transaction(async (tx) => {
    const contact = await tx.voterContact.create({
      data: {
        organizationId: actor.organizationId,
        voterId: voter.id,
        method: input.method,
        outcome: input.outcome,
        supportLevelObserved: input.supportLevelObserved,
        notes: input.notes,
        contactedAt: input.contactedAt ?? new Date(),
        contactedById: actor.id,
        canvassingVisitId: input.canvassingVisitId,
      },
    });

    if (input.supportLevelObserved) {
      await tx.voter.update({ where: { id: voter.id }, data: { supportLevel: input.supportLevelObserved } });
    }

    return contact;
  });
}

interface ListContactsQuery extends PaginationQuery {
  method?: ContactMethod;
  outcome?: ContactOutcome;
}

export async function listContacts(actor: ActingUser, voterId: string, query: ListContactsQuery) {
  await getVoterById(actor, voterId); // authorizes + 404s

  const where: Prisma.VoterContactWhereInput = {
    voterId,
    ...(query.method ? { method: query.method } : {}),
    ...(query.outcome ? { outcome: query.outcome } : {}),
  };

  const [items, totalItems] = await Promise.all([
    prisma.voterContact.findMany({ where, orderBy: { contactedAt: 'desc' }, ...toSkipTake(query) }),
    prisma.voterContact.count({ where }),
  ]);

  return { items, totalItems };
}

// ============================= Family relationships (Module 09) =============================
// See the design note on VoterRelationship in prisma/schema.prisma: SPOUSE is
// symmetric (one row, either side), PARENT_OF is directional, both sides must
// already be real Voter rows (matched against the voter list, never created
// here), and household residency is deliberately not touched by any of this.

interface CreateRelationshipInput {
  relatedVoterId: string;
  type: FamilyRelationType;
}

export async function createRelationship(actor: ActingUser, voterId: string, input: CreateRelationshipInput) {
  if (voterId === input.relatedVoterId) {
    throw ApiError.badRequest('A voter cannot have a family relationship with themselves');
  }

  // getVoterById enforces org scoping + geo-scope access for both sides —
  // you can only link two voters you're each independently allowed to see.
  await getVoterById(actor, voterId);
  await getVoterById(actor, input.relatedVoterId);

  if (input.type === FamilyRelationType.SPOUSE) {
    const existing = await prisma.voterRelationship.findFirst({
      where: {
        type: FamilyRelationType.SPOUSE,
        OR: [
          { voterId, relatedVoterId: input.relatedVoterId },
          { voterId: input.relatedVoterId, relatedVoterId: voterId },
        ],
      },
    });
    if (existing) throw ApiError.conflict('This spousal relationship already exists');
  }

  try {
    return await prisma.voterRelationship.create({
      data: {
        organizationId: actor.organizationId,
        voterId,
        relatedVoterId: input.relatedVoterId,
        type: input.type,
        createdById: actor.id,
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw ApiError.conflict('This relationship already exists');
    }
    throw err;
  }
}

export async function deleteRelationship(actor: ActingUser, voterId: string, relationshipId: string): Promise<void> {
  await getVoterById(actor, voterId);

  const relationship = await prisma.voterRelationship.findFirst({
    where: { id: relationshipId, OR: [{ voterId }, { relatedVoterId: voterId }] },
  });
  if (!relationship) throw ApiError.notFound('Relationship not found');

  await prisma.voterRelationship.delete({ where: { id: relationship.id } });
}

const RELATIONSHIP_VOTER_SELECT = {
  id: true,
  fullName: true,
  dateOfBirth: true,
  gender: true,
} as const;

export async function listRelationships(actor: ActingUser, voterId: string) {
  await getVoterById(actor, voterId);

  const relationships = await prisma.voterRelationship.findMany({
    where: { OR: [{ voterId }, { relatedVoterId: voterId }] },
    include: {
      voter: { select: RELATIONSHIP_VOTER_SELECT },
      relatedVoter: { select: RELATIONSHIP_VOTER_SELECT },
    },
    orderBy: { createdAt: 'asc' },
  });

  // Normalized so the caller always sees "the other person" regardless of
  // which side `voterId` happened to be stored on — direction only matters
  // for PARENT_OF, surfaced explicitly rather than left implicit.
  return relationships.map((r) => ({
    id: r.id,
    type: r.type,
    otherVoter: r.voterId === voterId ? r.relatedVoter : r.voter,
    direction: r.voterId === voterId ? ('FORWARD' as const) : ('INVERSE' as const),
  }));
}
