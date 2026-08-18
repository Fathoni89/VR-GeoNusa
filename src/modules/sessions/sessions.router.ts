import { Router, type Request, type RequestHandler } from 'express';
import type { AuthPrincipal, StudentPrincipal } from '../../shared/types';
import type { SessionsService } from './sessions.service';

type AsyncHandler = (
  request: Request,
  response: Parameters<RequestHandler>[1],
) => Promise<void>;

export interface SessionsRouterOptions {
  service: SessionsService;
  publicWriteLimiter: RequestHandler;
  verifyToken(token: string): AuthPrincipal | null | Promise<AuthPrincipal | null>;
}

function forwardAsync(handler: AsyncHandler): RequestHandler {
  return (request, response, next) => {
    void handler(request, response).catch(next);
  };
}

async function optionalStudent(
  request: Request,
  verifyToken: SessionsRouterOptions['verifyToken'],
): Promise<StudentPrincipal | null> {
  const authorization = request.headers.authorization || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : null;
  if (!token) return null;
  const principal = await verifyToken(token);
  return principal && 'student_id' in principal ? principal : null;
}

export function createSessionsRouter(options: SessionsRouterOptions): Router {
  const router = Router();

  router.post('/', options.publicWriteLimiter, forwardAsync(async (request, response) => {
    const result = await options.service.create(
      await optionalStudent(request, options.verifyToken),
      request.body,
    );
    response.status(201).json({ success: true, ...result });
  }));

  router.put('/:id/end', options.publicWriteLimiter, forwardAsync(async (request, response) => {
    const result = await options.service.end(
      await optionalStudent(request, options.verifyToken),
      String(request.params.id),
      request.get('X-Session-Token'),
    );
    if (!result.ok) {
      response.status(result.status).json({ success: false, message: result.message });
      return;
    }
    response.json({ success: true });
  }));

  return router;
}
