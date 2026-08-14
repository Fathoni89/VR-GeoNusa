import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..', '..');
const REQUIRED_MODULES = [
  'src/app.ts',
  'src/server.ts',
  'src/config/env.ts',
  'src/config/paths.ts',
  'src/db/client.ts',
  'src/middleware/authenticate.ts',
  'src/middleware/authorize.ts',
  'src/middleware/error-handler.ts',
  'src/middleware/rate-limit.ts',
  'src/middleware/validate.ts',
  'src/shared/app-error.ts',
  'src/shared/ids.ts',
  'src/shared/types.ts',
] as const;

describe('fondasi modular monolith Fase 5', () => {
  test('seluruh module infrastruktur tersedia sebagai TypeScript', () => {
    for (const relativePath of REQUIRED_MODULES) {
      expect(existsSync(path.join(PROJECT_ROOT, relativePath)), relativePath).toBe(true);
    }
  });

  test('environment tervalidasi dan default kompatibel tetap tersedia', async () => {
    const { parseEnv } = await import('../../src/config/env');

    expect(parseEnv({})).toMatchObject({
      NODE_ENV: 'development',
      PORT: 4000,
      DB_HOST: 'localhost',
      DB_PORT: 3306,
    });
    expect(parseEnv({ PORT: '4500', DB_PORT: '3307' })).toMatchObject({
      PORT: 4500,
      DB_PORT: 3307,
    });
    expect(() => parseEnv({ PORT: '70000' })).toThrow(/environment/i);
  });

  test('path canonical mengikuti root runtime tanpa membaca environment', async () => {
    const { createPaths } = await import('../../src/config/paths');
    const root = path.join(PROJECT_ROOT, 'runtime-root');
    const paths = createPaths(root);

    expect(paths.dataDir).toBe(path.join(root, 'data'));
    expect(paths.publicDir).toBe(path.join(root, 'public'));
    expect(paths.schemaFile).toBe(path.join(root, 'db', 'schema.mysql.sql'));
  });

  test('server compatibility memakai module baru dan tidak membaca process.env langsung', () => {
    const source = readFileSync(path.join(PROJECT_ROOT, 'server.js'), 'utf8');

    expect(source).not.toContain('process.env');
    expect(source).not.toContain('mysql.createPool');
    expect(source).toContain("require('./src/config/env')");
    expect(source).toContain("require('./src/db/client')");
    expect(source).toContain("require('./src/middleware/authenticate')");
    expect(source).toContain("require('./src/middleware/error-handler')");
  });

  test('app baru tidak memuat query database atau route bisnis', () => {
    const source = readFileSync(path.join(PROJECT_ROOT, 'src', 'app.ts'), 'utf8');

    expect(source).not.toMatch(/\.query\s*\(/);
    expect(source).not.toMatch(/\/api\//);
  });
});
