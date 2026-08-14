import type { RequestHandler } from 'express';
import type { AuthenticatedRequest } from './authenticate';
import type { StaffRole } from '../shared/types';

const FORBIDDEN_RESPONSE = {
  success: false,
  message: 'Tidak punya akses untuk aksi ini',
};

export function requireRole(role: StaffRole): RequestHandler {
  return (request, response, next) => {
    if ((request as AuthenticatedRequest).account.role !== role) {
      response.status(403).json(FORBIDDEN_RESPONSE);
      return;
    }
    next();
  };
}

export function requireAnyRole(...roles: StaffRole[]): RequestHandler {
  return (request, response, next) => {
    const accountRole = (request as AuthenticatedRequest).account.role;
    if (!roles.includes(accountRole)) {
      response.status(403).json(FORBIDDEN_RESPONSE);
      return;
    }
    next();
  };
}
