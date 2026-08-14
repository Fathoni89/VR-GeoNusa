import type { ErrorRequestHandler } from 'express';
import { AppError } from '../shared/app-error';
import type { AppLogger } from '../shared/types';

interface ErrorLike {
  message?: unknown;
  statusCode?: unknown;
}

function errorLike(error: unknown): ErrorLike {
  return typeof error === 'object' && error !== null ? error : {};
}

export const errorHandler: ErrorRequestHandler = (error, request, response, next) => {
  if (response.headersSent) {
    next(error);
    return;
  }

  const logger = request.app.locals.logger as AppLogger;
  logger.error('Request gagal:', error);
  const candidate = errorLike(error);
  const statusCode = error instanceof AppError
    ? error.statusCode
    : candidate.statusCode === 400 ? 400 : 500;
  const message = statusCode < 500 && typeof candidate.message === 'string'
    ? candidate.message
    : 'Internal server error';
  response.status(statusCode).json({ success: false, message });
};
