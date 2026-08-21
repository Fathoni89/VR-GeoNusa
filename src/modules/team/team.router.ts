import { Router, type RequestHandler } from 'express';
import { collectBoundedStream } from '../../shared/bounded-stream';
import type { TeamService, TeamServiceResult } from './team.service';

export const MAX_TEAM_PHOTO_BYTES = 3 * 1024 * 1024;

export interface TeamRouterOptions {
  service: TeamService;
  requireAuth: RequestHandler;
  requireSuperAdmin: RequestHandler;
}

function sendError(
  result: TeamServiceResult<unknown> & { ok: false },
  response: Parameters<RequestHandler>[1],
): void {
  response.status(result.status).json({ success: false, message: result.message });
}

function forwardAsync(
  handler: (
    request: Parameters<RequestHandler>[0],
    response: Parameters<RequestHandler>[1],
  ) => Promise<void>,
): RequestHandler {
  return (request, response, next) => {
    void handler(request, response).catch(next);
  };
}

export function createTeamRouter(options: TeamRouterOptions): Router {
  const router = Router();
  const writeAccess = [options.requireAuth, options.requireSuperAdmin];

  router.get('/', (_request, response) => {
    response.json({ success: true, data: options.service.list() });
  });

  router.post('/', ...writeAccess, (request, response) => {
    const result = options.service.create(request.body);
    if (!result.ok) return sendError(result, response);
    response.status(201).json({ success: true, data: result.value });
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

  router.patch('/reorder', ...writeAccess, (request, response) => {
    const result = options.service.reorder(request.body);
    if (!result.ok) return sendError(result, response);
    response.json({ success: true, data: result.value });
  });

  router.post(
    '/:id/photo',
    ...writeAccess,
    forwardAsync(async (request, response) => {
      if (!/^image\/(?:jpeg|png|webp)(?:;|$)/i.test(request.get('content-type') ?? '')) {
        response.status(415).json({
          success: false,
          message: 'Foto harus berupa JPEG, PNG, atau WebP yang valid',
        });
        return;
      }
      const collected = await collectBoundedStream(request, MAX_TEAM_PHOTO_BYTES);
      if (!collected.ok) {
        response.status(413).json({ success: false, message: 'Foto maksimal 3MB' });
        return;
      }
      const result = await options.service.uploadPhoto(request.params.id, collected.buffer);
      if (!result.ok) return sendError(result, response);
      response.json({ success: true, photo: result.value });
    }),
  );

  return router;
}
