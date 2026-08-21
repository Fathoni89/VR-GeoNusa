import {
  livenessSchema,
  readinessSchema,
  type Liveness,
  type Readiness,
} from './health.schema';
import type { HealthRepository } from './health.repository';

export interface HealthServiceResult<T> {
  status: number;
  body: T;
}

export interface HealthService {
  liveness(): Liveness;
  databaseReadiness(): Promise<HealthServiceResult<Readiness>>;
  mlReadiness(): HealthServiceResult<Readiness>;
}

export function createHealthService(
  repository: HealthRepository,
  isMlReady: () => boolean,
  now: () => Date = () => new Date(),
): HealthService {
  const readiness = (component: Readiness['component'], ready: boolean) => ({
    status: ready ? 200 : 503,
    body: readinessSchema.parse({
      success: ready,
      status: ready ? 'ready' : 'unavailable',
      component,
      timestamp: now().toISOString(),
    }),
  });

  return {
    liveness() {
      return livenessSchema.parse({
        success: true,
        message: 'VR-GeoNusa server running',
        version: '2.0.0',
        status: 'live',
        timestamp: now().toISOString(),
      });
    },

    async databaseReadiness() {
      try {
        return readiness('database', await repository.databaseReady());
      } catch {
        return readiness('database', false);
      }
    },

    mlReadiness() {
      return readiness('ml', isMlReady());
    },
  };
}
