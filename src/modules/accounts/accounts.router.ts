import { Router, type Request, type RequestHandler } from 'express';
import type { AuthenticatedRequest } from '../../middleware/authenticate';
import type { AccountsService } from './accounts.service';

type AsyncHandler = (
  request: Request,
  response: Parameters<RequestHandler>[1],
) => Promise<void>;

export interface AccountsRouterOptions {
  service: AccountsService;
  requireAuth: RequestHandler;
}

function forwardAsync(handler: AsyncHandler): RequestHandler {
  return (request, response, next) => {
    void handler(request, response).catch(next);
  };
}

function sendResultError(
  result: { ok: false; status: number; message: string },
  response: Parameters<RequestHandler>[1],
): void {
  response.status(result.status).json({ success: false, message: result.message });
}

export function createAccountsRouter(options: AccountsRouterOptions): Router {
  const router = Router();

  router.get('/', options.requireAuth, forwardAsync(async (request, response) => {
    const result = await options.service.list((request as AuthenticatedRequest).account);
    if (!result.ok) {
      sendResultError(result, response);
      return;
    }
    response.json({ success: true, data: result.value });
  }));

  router.post('/', options.requireAuth, forwardAsync(async (request, response) => {
    const result = await options.service.create(
      (request as AuthenticatedRequest).account,
      request.body,
    );
    if (!result.ok) {
      sendResultError(result, response);
      return;
    }
    response.status(201).json({ success: true, data: result.value });
  }));

  router.put('/:id/reset-password', options.requireAuth, forwardAsync(async (request, response) => {
    const result = await options.service.resetPassword(
      (request as AuthenticatedRequest).account,
      String(request.params.id),
      request.body,
    );
    if (!result.ok) {
      sendResultError(result, response);
      return;
    }
    response.json({ success: true, message: 'Password akun berhasil direset' });
  }));

  router.delete('/:id', options.requireAuth, forwardAsync(async (request, response) => {
    const result = await options.service.delete(
      (request as AuthenticatedRequest).account,
      String(request.params.id),
    );
    if (!result.ok) {
      sendResultError(result, response);
      return;
    }
    response.json({ success: true, message: 'Akun dihapus' });
  }));

  return router;
}
