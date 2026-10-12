import { Request, Response } from 'express';
import * as votersService from './voters.service';
import { sendPaginated, sendSuccess } from '../../utils/apiResponse';
import { toPaginationMeta } from '../../utils/pagination';
import { recordAudit } from '../../utils/audit';
import { ApiError } from '../../utils/ApiError';

function actor(req: Request) {
  if (!req.user) throw ApiError.unauthorized();
  return req.user;
}

// --- Voter CRUD ---
export async function createVoterHandler(req: Request, res: Response): Promise<void> {
  const voter = await votersService.createVoter(actor(req), req.body);
  await recordAudit({ req, action: 'voter.create', entityType: 'Voter', entityId: voter.id, after: voter });
  sendSuccess(res, voter, 201);
}

export async function listVotersHandler(req: Request, res: Response): Promise<void> {
  const query = req.query as unknown as Parameters<typeof votersService.listVoters>[1];
  const { items, totalItems } = await votersService.listVoters(actor(req), query);
  sendPaginated(res, items, toPaginationMeta(totalItems, query));
}

export async function getVoterHandler(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await votersService.getVoterById(actor(req), req.params.id));
}

export async function updateVoterHandler(req: Request, res: Response): Promise<void> {
  const before = await votersService.getVoterById(actor(req), req.params.id);
  const updated = await votersService.updateVoter(actor(req), req.params.id, req.body);
  await recordAudit({ req, action: 'voter.update', entityType: 'Voter', entityId: updated.id, before, after: updated });
  sendSuccess(res, updated);
}

export async function deleteVoterHandler(req: Request, res: Response): Promise<void> {
  await votersService.deleteVoter(actor(req), req.params.id);
  await recordAudit({ req, action: 'voter.delete', entityType: 'Voter', entityId: req.params.id });
  sendSuccess(res, { message: 'Voter deleted' });
}

// --- Import ---
export async function startImportHandler(req: Request, res: Response): Promise<void> {
  if (!req.file) throw ApiError.badRequest('No file uploaded — attach it as multipart field "file"');

  const job = await votersService.runVoterImport(actor(req), {
    wardId: req.body.wardId,
    toleId: req.body.toleId,
    file: req.file,
  });
  await recordAudit({
    req,
    action: 'voter.import',
    entityType: 'VoterImportJob',
    entityId: job.id,
    after: job,
  });
  sendSuccess(res, job, 201);
}

export async function listImportJobsHandler(req: Request, res: Response): Promise<void> {
  const query = req.query as unknown as Parameters<typeof votersService.listImportJobs>[1];
  const { items, totalItems } = await votersService.listImportJobs(actor(req), query);
  sendPaginated(res, items, toPaginationMeta(totalItems, query));
}

export async function getImportJobHandler(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await votersService.getImportJobById(actor(req), req.params.id));
}

export async function listImportIssuesHandler(req: Request, res: Response): Promise<void> {
  const query = req.query as unknown as Parameters<typeof votersService.listImportIssues>[2];
  const { items, totalItems } = await votersService.listImportIssues(actor(req), req.params.id, query);
  sendPaginated(res, items, toPaginationMeta(totalItems, query));
}

// --- Contact history ---
export async function createContactHandler(req: Request, res: Response): Promise<void> {
  const contact = await votersService.createContact(actor(req), req.params.id, req.body);
  await recordAudit({
    req,
    action: 'voter.contact_create',
    entityType: 'VoterContact',
    entityId: contact.id,
    after: contact,
  });
  sendSuccess(res, contact, 201);
}

export async function listContactsHandler(req: Request, res: Response): Promise<void> {
  const query = req.query as unknown as Parameters<typeof votersService.listContacts>[2];
  const { items, totalItems } = await votersService.listContacts(actor(req), req.params.id, query);
  sendPaginated(res, items, toPaginationMeta(totalItems, query));
}

// --- Family relationships ---
export async function createRelationshipHandler(req: Request, res: Response): Promise<void> {
  const relationship = await votersService.createRelationship(actor(req), req.params.id, req.body);
  await recordAudit({
    req,
    action: 'voter.relationship_create',
    entityType: 'VoterRelationship',
    entityId: relationship.id,
    after: relationship,
  });
  sendSuccess(res, relationship, 201);
}

export async function listRelationshipsHandler(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await votersService.listRelationships(actor(req), req.params.id));
}

export async function deleteRelationshipHandler(req: Request, res: Response): Promise<void> {
  await votersService.deleteRelationship(actor(req), req.params.id, req.params.relationshipId);
  await recordAudit({
    req,
    action: 'voter.relationship_delete',
    entityType: 'VoterRelationship',
    entityId: req.params.relationshipId,
  });
  sendSuccess(res, { message: 'Relationship deleted' });
}
