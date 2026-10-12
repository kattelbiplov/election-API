import { NextFunction, Request, Response } from 'express';
import { AnyZodObject } from 'zod';

interface ValidationSchemas {
  body?: AnyZodObject;
  query?: AnyZodObject;
  params?: AnyZodObject;
}

// Validates and *replaces* req.body/query/params with the parsed (and
// type-coerced/defaulted) result, so downstream handlers can trust the shape.
// Zod errors thrown here are caught by asyncHandler/Express and formatted by
// errorHandler.ts into a 400 with per-field details.
export function validate(schemas: ValidationSchemas) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (schemas.body) {
      req.body = schemas.body.parse(req.body);
    }
    if (schemas.query) {
      req.query = schemas.query.parse(req.query) as unknown as Request['query'];
    }
    if (schemas.params) {
      req.params = schemas.params.parse(req.params) as unknown as Request['params'];
    }
    next();
  };
}
