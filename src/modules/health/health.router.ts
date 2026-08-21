import { Router } from 'express';
import type { HealthService } from './health.service';

export function createHealthRouter(service: HealthService): Router {
  const router = Router();

  router.get('/', (_request, response) => {
    response.json(service.liveness());
  });

  router.get('/readiness/database', async (_request, response) => {
    const result = await service.databaseReadiness();
    response.status(result.status).json(result.body);
  });

  router.get('/readiness/ml', (_request, response) => {
    const result = service.mlReadiness();
    response.status(result.status).json(result.body);
  });

  return router;
}
