import { z } from 'zod';
import { AppError } from '../shared/app-error';
import type { EnvironmentSource } from '../shared/types';

function integerWithDefault(defaultValue: number, minimum: number, maximum: number) {
  return z.preprocess(
    value => value === undefined || value === '' ? defaultValue : value,
    z.coerce.number().int().min(minimum).max(maximum)
  );
}

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: integerWithDefault(4000, 1, 65_535),
  DB_HOST: z.string().min(1).default('localhost'),
  DB_PORT: integerWithDefault(3306, 1, 65_535),
  DB_USER: z.string().optional(),
  DB_PASSWORD: z.string().optional(),
  DB_NAME: z.string().optional(),
  BOOTSTRAP_ADMIN_PASSWORD: z.string().optional(),
});

export type AppEnv = z.infer<typeof environmentSchema>;

export function parseEnv(source: EnvironmentSource): AppEnv {
  const result = environmentSchema.safeParse(source);
  if (!result.success) {
    const fields = [...new Set(result.error.issues.map(issue => issue.path.join('.')))]
      .filter(Boolean)
      .join(', ');
    throw new AppError(`Invalid environment configuration: ${fields || 'unknown field'}`, {
      code: 'INVALID_ENVIRONMENT',
    });
  }
  return result.data;
}

export const runtimeEnv = parseEnv(process.env);
