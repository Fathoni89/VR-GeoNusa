import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..', '..');
const REQUIRED_MODULES = [
  'src/modules/schools/schools.router.ts',
  'src/modules/schools/schools.schema.ts',
  'src/modules/schools/schools.service.ts',
  'src/modules/schools/schools.repository.ts',
  'src/modules/accounts/accounts.router.ts',
  'src/modules/accounts/accounts.schema.ts',
  'src/modules/accounts/accounts.service.ts',
  'src/modules/accounts/accounts.repository.ts',
] as const;

describe('module schools dan accounts Fase 6B', () => {
  test('router, schema, service, dan repository tersedia', () => {
    for (const relativePath of REQUIRED_MODULES) {
      expect(existsSync(path.join(PROJECT_ROOT, relativePath)), relativePath).toBe(true);
    }
  });

  test('deklarasi route legacy sudah dipindahkan dari server compatibility', () => {
    const source = readFileSync(path.join(PROJECT_ROOT, 'server.js'), 'utf8');
    const legacyRoutes = [
      "app.get('/api/schools'",
      "app.post('/api/schools'",
      "app.delete('/api/schools/:id'",
      "app.get('/api/accounts'",
      "app.post('/api/accounts'",
      "app.put('/api/accounts/:id/reset-password'",
      "app.delete('/api/accounts/:id'",
    ];

    for (const declaration of legacyRoutes) {
      expect(source, declaration).not.toContain(declaration);
    }
  });

  test('router dan service tidak menjalankan query database langsung', () => {
    for (const relativePath of REQUIRED_MODULES.filter(file =>
      file.endsWith('.router.ts') || file.endsWith('.service.ts')
    )) {
      const source = readFileSync(path.join(PROJECT_ROOT, relativePath), 'utf8');
      expect(source, relativePath).not.toMatch(/\.query\s*\(/);
    }
  });
});
