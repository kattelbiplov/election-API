import { Response } from 'express';

// Every successful response on this API uses one of these two envelopes so the
// frontend can rely on a single response shape. See docs/openapi.yaml "Response Envelope".
export interface PaginationMeta {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export function sendSuccess<T>(res: Response, data: T, statusCode = 200): Response {
  return res.status(statusCode).json({ success: true, data });
}

export function sendPaginated<T>(
  res: Response,
  items: T[],
  pagination: PaginationMeta,
  statusCode = 200,
): Response {
  return res.status(statusCode).json({ success: true, data: items, pagination });
}
