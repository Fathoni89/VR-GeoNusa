import type { RequestHandler } from 'express';
import type { z } from 'zod';
import { AppError } from '../shared/app-error';

export function validateBody(schema: z.ZodType): RequestHandler {
  return (request, _response, next) => {
    const result = schema.safeParse(request.body);
    if (!result.success) {
      const fields = result.error.issues.map(issue => issue.path.join('.')).filter(Boolean);
      next(new AppError(`Request tidak valid: ${fields.join(', ') || 'body'}`, {
        statusCode: 400,
        code: 'INVALID_REQUEST',
      }));
      return;
    }
    request.body = result.data;
    next();
  };
}
