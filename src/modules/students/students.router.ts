import { Router, type Request, type RequestHandler } from 'express';
import type { AuthenticatedRequest } from '../../middleware/authenticate';
import type { AuthPrincipal, StudentPrincipal } from '../../shared/types';
import type { StudentsService } from './students.service';

type AsyncHandler = (
  request: Request,
  response: Parameters<RequestHandler>[1],
) => Promise<void>;

interface StudentAuthenticatedRequest extends Request {
  student: StudentPrincipal;
}

export interface StudentsRouterOptions {
  service: StudentsService;
  requireAuth: RequestHandler;
  verifyToken(token: string): AuthPrincipal | null | Promise<AuthPrincipal | null>;
}

function forwardAsync(handler: AsyncHandler): RequestHandler {
  return (request, response, next) => {
    void handler(request, response).catch(next);
  };
}

function sendError(
  result: { ok: false; status: number; message: string },
  response: Parameters<RequestHandler>[1],
): void {
  response.status(result.status).json({ success: false, message: result.message });
}

export function createStudentsRouter(options: StudentsRouterOptions): Router {
  const router = Router();

  const requireStudent: RequestHandler = async (request, response, next) => {
    try {
      const authorization = request.headers.authorization || '';
      const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : null;
      const principal = token ? await options.verifyToken(token) : null;
      if (!principal || !('student_id' in principal)) {
        response.status(401).json({
          success: false,
          message: 'Unauthorized — login siswa terlebih dahulu',
        });
        return;
      }
      (request as StudentAuthenticatedRequest).student = principal;
      next();
    } catch (error) {
      next(error);
    }
  };

  router.put('/:id/reset-password', options.requireAuth, forwardAsync(async (request, response) => {
    const result = await options.service.resetPassword(
      (request as AuthenticatedRequest).account,
      String(request.params.id),
    );
    if (!result.ok) {
      sendError(result, response);
      return;
    }
    response.json({ success: true, password: result.value });
  }));

  router.delete('/:id', options.requireAuth, forwardAsync(async (request, response) => {
    const result = await options.service.delete(
      (request as AuthenticatedRequest).account,
      String(request.params.id),
    );
    if (!result.ok) {
      sendError(result, response);
      return;
    }
    response.json({ success: true, message: 'Siswa dihapus' });
  }));

  router.get('/me/results', requireStudent, forwardAsync(async (request, response) => {
    const data = await options.service.getOwnResults(
      (request as StudentAuthenticatedRequest).student,
    );
    response.json({ success: true, data });
  }));

  return router;
}
