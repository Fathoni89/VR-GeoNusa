import { Router, type Request, type RequestHandler } from 'express';
import type { AuthenticatedRequest } from '../../middleware/authenticate';
import type { SchoolsService } from './schools.service';

type AsyncHandler = (
  request: Request,
  response: Parameters<RequestHandler>[1],
) => Promise<void>;

export interface SchoolsRouterOptions {
  service: SchoolsService;
  requireAuth: RequestHandler;
}

function forwardAsync(handler: AsyncHandler): RequestHandler {
  return (request, response, next) => {
    void handler(request, response).catch(next);
  };
}

export function createSchoolsRouter(options: SchoolsRouterOptions): Router {
  const router = Router();

  router.get('/', forwardAsync(async (_request, response) => {
    response.json({ success: true, data: await options.service.list() });
  }));

  router.post('/', options.requireAuth, forwardAsync(async (request, response) => {
    const result = await options.service.create(
      (request as AuthenticatedRequest).account,
      request.body,
    );
    if (!result.ok) {
      response.status(result.status).json({ success: false, message: result.message });
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
      response.status(result.status).json({ success: false, message: result.message });
      return;
    }
    response.json({ success: true, message: 'Sekolah dihapus' });
  }));

  return router;
}
