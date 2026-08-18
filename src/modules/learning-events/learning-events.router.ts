import { Router, type Request, type RequestHandler } from 'express';
import type { AuthPrincipal, StudentPrincipal } from '../../shared/types';
import type {
  EventRequestContext,
  LearningEventResult,
  LearningEventsService,
} from './learning-events.service';

type AsyncHandler = (
  request: Request,
  response: Parameters<RequestHandler>[1],
) => Promise<void>;

export interface LearningEventsRouterOptions {
  service: LearningEventsService;
  publicWriteLimiter: RequestHandler;
  verifyToken(token: string): AuthPrincipal | null | Promise<AuthPrincipal | null>;
}

function forwardAsync(handler: AsyncHandler): RequestHandler {
  return (request, response, next) => {
    void handler(request, response).catch(next);
  };
}

async function requestContext(
  request: Request,
  verifyToken: LearningEventsRouterOptions['verifyToken'],
): Promise<EventRequestContext> {
  const authorization = request.headers.authorization || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : null;
  let student: StudentPrincipal | null = null;
  if (token) {
    const principal = await verifyToken(token);
    student = principal && 'student_id' in principal ? principal : null;
  }
  return { student, sessionToken: request.get('X-Session-Token') };
}

function sendResult(
  result: LearningEventResult,
  response: Parameters<RequestHandler>[1],
): void {
  if (!result.ok) {
    response.status(result.status).json({ success: false, message: result.message });
    return;
  }
  response.status(201).json({ success: true });
}

export function createLearningEventsRouter(options: LearningEventsRouterOptions): Router {
  const router = Router();

  router.post('/interactions', options.publicWriteLimiter, forwardAsync(async (request, response) => {
    sendResult(
      await options.service.createInteraction(
        await requestContext(request, options.verifyToken),
        request.body,
      ),
      response,
    );
  }));

  router.post('/predictions', options.publicWriteLimiter, forwardAsync(async (request, response) => {
    sendResult(
      await options.service.createPrediction(
        await requestContext(request, options.verifyToken),
        request.body,
      ),
      response,
    );
  }));

  router.post('/quiz-results', options.publicWriteLimiter, forwardAsync(async (request, response) => {
    sendResult(
      await options.service.createQuizResult(
        await requestContext(request, options.verifyToken),
        request.body,
      ),
      response,
    );
  }));

  return router;
}
