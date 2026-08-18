import { Router, type RequestHandler } from 'express';
import type { ToursService } from './tours.service';

export interface ToursRouterOptions {
  service: ToursService;
  requireAuth: RequestHandler;
  requireSuperAdmin: RequestHandler;
}

function sendError(
  result: { ok: false; status: number; message: string },
  response: Parameters<RequestHandler>[1],
): void {
  response.status(result.status).json({ success: false, message: result.message });
}

export function createToursRouter(options: ToursRouterOptions): Router {
  const router = Router();

  router.get('/tours', (_request, response) => {
    response.json({ success: true, data: options.service.list() });
  });

  router.put(
    '/tour/:tourId/folder/:folder',
    options.requireAuth,
    options.requireSuperAdmin,
    (request, response) => {
      const result = options.service.updateFolder(
        request.params.tourId,
        request.params.folder,
        request.body,
      );
      if (!result.ok) return sendError(result, response);
      response.json({
        success: true,
        folder: result.value.folder,
        applied_to: result.value.appliedTo,
        identify: result.value.identify,
      });
    },
  );

  return router;
}
