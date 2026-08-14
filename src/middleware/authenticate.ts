import type { Request, RequestHandler } from 'express';
import type { AccountPrincipal } from '../shared/types';

export interface AuthenticatedRequest extends Request {
  account: AccountPrincipal;
}

export interface AuthenticationOptions {
  cookieName: string;
  verifyToken(token: string): AccountPrincipal | null;
  passwordChangePath?: string;
}

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.cookie || '';
  for (const item of header.split(';')) {
    const separator = item.indexOf('=');
    if (separator < 0) continue;
    const key = item.slice(0, separator).trim();
    if (key !== name) continue;
    try {
      return decodeURIComponent(item.slice(separator + 1).trim());
    } catch {
      return null;
    }
  }
  return null;
}

export function createAuthentication(options: AuthenticationOptions) {
  const passwordChangePath = options.passwordChangePath ?? '/api/auth/change-password';

  function readAuthToken(request: Request): string | null {
    const authorization = request.headers.authorization || '';
    if (authorization.startsWith('Bearer ')) return authorization.slice(7);
    return readCookie(request, options.cookieName);
  }

  const requireAuth: RequestHandler = (request, response, next) => {
    const token = readAuthToken(request);
    const account = token ? options.verifyToken(token) : null;
    if (!account) {
      response.status(401).json({
        success: false,
        message: 'Unauthorized — login terlebih dahulu',
      });
      return;
    }
    if (account.must_change_password === true && request.path !== passwordChangePath) {
      response.status(403).json({
        success: false,
        message: 'Password wajib diganti sebelum melanjutkan',
      });
      return;
    }
    (request as AuthenticatedRequest).account = account;
    next();
  };

  return { readAuthToken, requireAuth };
}
