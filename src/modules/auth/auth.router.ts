import { Router, type CookieOptions, type Request, type RequestHandler } from 'express';
import {
  changePasswordSchema,
  staffLoginSchema,
  studentLoginSchema,
} from './auth.schema';
import type { AuthService } from './auth.service';

type AsyncRequestHandler = (
  request: Request,
  response: Parameters<RequestHandler>[1],
) => Promise<void>;

export interface AuthRouterOptions {
  service: AuthService;
  readAuthToken(request: Request): string | null;
  staffLoginLimiter: RequestHandler;
  publicWriteLimiter: RequestHandler;
  cookieName: string;
  cookieOptions(): CookieOptions;
}

function forwardAsync(handler: AsyncRequestHandler): RequestHandler {
  return (request, response, next) => {
    void handler(request, response).catch(next);
  };
}

export function createAuthRouter(options: AuthRouterOptions): Router {
  const router = Router();

  router.post('/login', options.staffLoginLimiter, forwardAsync(async (request, response) => {
    const parsed = staffLoginSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({
        success: false,
        message: 'Username dan password wajib diisi',
      });
      return;
    }

    const result = await options.service.loginStaff(parsed.data);
    if (!result) {
      response.status(401).json({ success: false, message: 'Username atau password salah' });
      return;
    }

    const cookieMode = String(request.get('X-Auth-Mode') || '').toLowerCase() === 'cookie';
    if (cookieMode) {
      response.cookie(options.cookieName, result.token, options.cookieOptions());
    }
    response.json({
      success: true,
      ...(!cookieMode ? { token: result.token } : {}),
      username: result.username,
      role: result.role,
      school_id: result.school_id,
      must_change_password: result.must_change_password,
    });
  }));

  router.get('/verify', forwardAsync(async (request, response) => {
    const token = options.readAuthToken(request);
    const principal = token ? await options.service.verifyToken(token) : null;
    if (!principal) {
      response.status(401).json({
        success: false,
        message: 'Token tidak valid atau expired',
      });
      return;
    }

    response.json({
      success: true,
      ...(principal.kind === 'staff' ? { username: principal.username } : {}),
      role: principal.role,
      school_id: principal.school_id,
      must_change_password: principal.kind === 'staff'
        ? principal.must_change_password
        : false,
    });
  }));

  router.post('/change-password', forwardAsync(async (request, response) => {
    const token = options.readAuthToken(request);
    const principal = token ? await options.service.verifyToken(token) : null;
    if (!token || !principal || principal.kind !== 'staff') {
      response.status(401).json({
        success: false,
        message: 'Unauthorized — login terlebih dahulu',
      });
      return;
    }

    const body = request.body as Record<string, unknown> | null | undefined;
    const oldPassword = body?.old_password;
    const newPassword = body?.new_password;
    if (typeof oldPassword !== 'string' || oldPassword.length === 0
      || typeof newPassword !== 'string' || newPassword.length === 0) {
      response.status(400).json({
        success: false,
        message: 'old_password dan new_password wajib',
      });
      return;
    }
    if (newPassword.length < 6) {
      response.status(400).json({ success: false, message: 'Password minimal 6 karakter' });
      return;
    }

    const parsed = changePasswordSchema.safeParse(body);
    if (!parsed.success) {
      response.status(400).json({
        success: false,
        message: 'old_password dan new_password wajib',
      });
      return;
    }

    const result = await options.service.changePassword(token, parsed.data);
    if (result === 'unauthorized') {
      response.status(401).json({
        success: false,
        message: 'Unauthorized — login terlebih dahulu',
      });
      return;
    }
    if (result === 'wrong_password') {
      response.status(401).json({ success: false, message: 'Password lama salah' });
      return;
    }

    response.json({ success: true, message: 'Password berhasil diubah' });
  }));

  router.post(
    '/student-login',
    options.publicWriteLimiter,
    forwardAsync(async (request, response) => {
      const parsed = studentLoginSchema.safeParse(request.body);
      if (!parsed.success) {
        response.status(400).json({
          success: false,
          message: 'school_id, student_number, dan password wajib diisi',
        });
        return;
      }

      const result = await options.service.loginStudent(parsed.data);
      if (!result) {
        response.status(401).json({
          success: false,
          message: 'Nomor induk atau password salah',
        });
        return;
      }

      response.json({
        success: true,
        token: result.token,
        name: result.name,
        class_id: result.class_id,
        school_id: result.school_id,
      });
    }),
  );

  return router;
}
