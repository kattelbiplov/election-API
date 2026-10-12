import { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { MulterError } from 'multer';
import { ApiError } from '../utils/ApiError';
import { logger } from '../config/logger';

export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(ApiError.notFound(`No route matches ${req.method} ${req.originalUrl}`));
}

// Central error handler — must be registered last. Every thrown/rejected error
// in the app (route handlers wrapped with asyncHandler, sync middleware) ends
// up here so the API always returns the same error envelope:
// { success: false, error: { code, message, details? }, requestId }
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  let apiError: ApiError;

  if (err instanceof ApiError) {
    apiError = err;
  } else if (err instanceof ZodError) {
    apiError = ApiError.badRequest('Validation failed', err.flatten());
  } else if (err instanceof MulterError) {
    apiError = ApiError.badRequest(`File upload error: ${err.message}`);
  } else if (err instanceof Prisma.PrismaClientKnownRequestError) {
    apiError = mapPrismaError(err);
  } else if (err instanceof Error) {
    apiError = ApiError.internal(err.message);
  } else {
    apiError = ApiError.internal('Unknown error');
  }

  if (apiError.statusCode >= 500) {
    logger.error({ err, requestId: req.requestId }, 'Unhandled error');
  } else {
    logger.warn(
      { code: apiError.code, requestId: req.requestId, path: req.originalUrl },
      apiError.message,
    );
  }

  res.status(apiError.statusCode).json({
    success: false,
    error: {
      code: apiError.code,
      message: apiError.message,
      ...(apiError.details ? { details: apiError.details } : {}),
    },
    requestId: req.requestId,
  });
}

function mapPrismaError(err: Prisma.PrismaClientKnownRequestError): ApiError {
  switch (err.code) {
    case 'P2002':
      return ApiError.conflict('A record with this value already exists', { fields: err.meta?.target });
    case 'P2025':
      return ApiError.notFound('Related record not found');
    case 'P2003':
      return ApiError.badRequest('Invalid reference to a related record', { field: err.meta?.field_name });
    default:
      return ApiError.internal('Database error');
  }
}
