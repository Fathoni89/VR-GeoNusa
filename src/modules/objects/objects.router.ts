import { Router, type RequestHandler } from 'express';
import type { ObjectsService } from './objects.service';

export interface ObjectsRouterOptions {
  service: ObjectsService;
  requireAuth: RequestHandler;
  requireSuperAdmin: RequestHandler;
}

function sendError(
  result: { ok: false; status: number; message: string },
  response: Parameters<RequestHandler>[1],
): void {
  response.status(result.status).json({ success: false, message: result.message });
}

export function createObjectsRouter(options: ObjectsRouterOptions): Router {
  const router = Router();
  const writeAccess = [options.requireAuth, options.requireSuperAdmin];

  router.get('/:id/objects', (request, response) => {
    const result = options.service.list(request.params.id);
    if (!result.ok) return sendError(result, response);
    response.json({ success: true, data: result.value });
  });

  router.post('/:id/objects', ...writeAccess, (request, response) => {
    const result = options.service.create(request.params.id, request.body);
    if (!result.ok) return sendError(result, response);
    response.status(201).json({ success: true, data: result.value });
  });

  router.put('/:id/objects/:objId', ...writeAccess, (request, response) => {
    const result = options.service.update(
      request.params.id,
      request.params.objId,
      request.body,
    );
    if (!result.ok) return sendError(result, response);
    response.json({ success: true, data: result.value });
  });

  router.delete('/:id/objects/:objId', ...writeAccess, (request, response) => {
    const result = options.service.delete(request.params.id, request.params.objId);
    if (!result.ok) return sendError(result, response);
    response.json({ success: true, message: result.value });
  });

  return router;
}
