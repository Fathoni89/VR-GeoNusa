import express, { type Express, type RequestHandler } from 'express';

type RouteMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';
type RouteRegistrar = (route: unknown, ...handlers: RequestHandler[]) => unknown;

function asyncHandler(handler: RequestHandler): RequestHandler {
  return (request, response, next) => {
    try {
      Promise.resolve(handler(request, response, next)).catch(next);
    } catch (error) {
      next(error);
    }
  };
}

function installAsyncRouteHandling(app: Express): void {
  const methods: RouteMethod[] = ['get', 'post', 'put', 'patch', 'delete'];
  const mutableApp = app as unknown as Record<RouteMethod, RouteRegistrar>;

  for (const method of methods) {
    const register = mutableApp[method].bind(app);
    mutableApp[method] = (route, ...handlers) => {
      if (handlers.length === 0) return register(route);
      return register(route, ...handlers.map(asyncHandler));
    };
  }
}

export function createApp(): Express {
  const app = express();
  installAsyncRouteHandling(app);
  app.locals.logger = console;
  return app;
}
