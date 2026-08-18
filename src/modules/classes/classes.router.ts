import { Router, type Request, type RequestHandler } from 'express';
import type { AuthenticatedRequest } from '../../middleware/authenticate';
import type { StudentsService } from '../students/students.service';
import type { ClassesService } from './classes.service';

type AsyncHandler = (
  request: Request,
  response: Parameters<RequestHandler>[1],
) => Promise<void>;

export interface ClassesRouterOptions {
  service: ClassesService;
  studentsService: StudentsService;
  requireAuth: RequestHandler;
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

export function createClassesRouter(options: ClassesRouterOptions): Router {
  const router = Router();

  router.get('/', options.requireAuth, forwardAsync(async (request, response) => {
    const rows = await options.service.list(
      (request as AuthenticatedRequest).account,
      request.query.school_id,
    );
    response.json({ success: true, data: rows });
  }));

  router.post('/', options.requireAuth, forwardAsync(async (request, response) => {
    const result = await options.service.create(
      (request as AuthenticatedRequest).account,
      request.body,
    );
    if (!result.ok) {
      sendError(result, response);
      return;
    }
    response.status(201).json({ success: true, data: result.value });
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
    response.json({
      success: true,
      message: 'Kelas dihapus (siswa di kelas ini tidak ikut terhapus)',
    });
  }));

  router.get('/:id/students', options.requireAuth, forwardAsync(async (request, response) => {
    const result = await options.studentsService.listRoster(
      (request as AuthenticatedRequest).account,
      String(request.params.id),
    );
    if (!result.ok) {
      sendError(result, response);
      return;
    }
    response.json({ success: true, data: result.value });
  }));

  router.post('/:id/students/bulk', options.requireAuth, forwardAsync(async (request, response) => {
    const result = await options.studentsService.createBulk(
      (request as AuthenticatedRequest).account,
      String(request.params.id),
      request.body,
    );
    if (!result.ok) {
      sendError(result, response);
      return;
    }
    response.status(201).json({ success: true, ...result.value });
  }));

  return router;
}
