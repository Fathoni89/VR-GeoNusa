import { Router, type RequestHandler } from 'express';
import type { ScenesService } from './scenes.service';

export interface ScenesRouterOptions {
  service: ScenesService;
  requireAuth: RequestHandler;
  requireSuperAdmin: RequestHandler;
}

function sendError(
  result: { ok: false; status: number; message: string },
  response: Parameters<RequestHandler>[1],
): void {
  response.status(result.status).json({ success: false, message: result.message });
}

export function createScenesRouter(options: ScenesRouterOptions): Router {
  const router = Router();
  const writeAccess = [options.requireAuth, options.requireSuperAdmin];

  router.get('/', (_request, response) => {
    response.json({ success: true, data: options.service.list() });
  });

  router.get('/:id', (request, response) => {
    const result = options.service.get(request.params.id);
    if (!result.ok) return sendError(result, response);
    response.json({ success: true, data: result.value });
  });

  router.post('/', ...writeAccess, (request, response) => {
    const result = options.service.create(request.body);
    if (!result.ok) return sendError(result, response);
    response.status(201).json({
      success: true,
      data: result.value.scene,
      vr_url: result.value.vrUrl,
    });
  });

  router.put('/:id', ...writeAccess, (request, response) => {
    const result = options.service.update(request.params.id, request.body);
    if (!result.ok) return sendError(result, response);
    response.json({ success: true, data: result.value });
  });

  router.delete('/:id', ...writeAccess, (request, response) => {
    const result = options.service.delete(request.params.id);
    if (!result.ok) return sendError(result, response);
    response.json({ success: true, message: result.value });
  });

  return router;
}
