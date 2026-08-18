import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..', '..');
const REQUIRED_MODULES = [
  'src/modules/sessions/sessions.router.ts',
  'src/modules/sessions/sessions.schema.ts',
  'src/modules/sessions/sessions.service.ts',
  'src/modules/sessions/sessions.repository.ts',
  'src/modules/learning-events/learning-events.router.ts',
  'src/modules/learning-events/learning-events.schema.ts',
  'src/modules/learning-events/learning-events.service.ts',
  'src/modules/learning-events/learning-events.repository.ts',
] as const;

describe('module sessions dan learning-events Fase 6D', () => {
  test('router, schema, service, dan repository tersedia', () => {
    for (const relativePath of REQUIRED_MODULES) {
      expect(existsSync(path.join(PROJECT_ROOT, relativePath)), relativePath).toBe(true);
    }
  });

  test('deklarasi route legacy sudah dipindahkan dari server compatibility', () => {
    const source = readFileSync(path.join(PROJECT_ROOT, 'server.js'), 'utf8');
    const legacyRoutes = [
      "app.post('/api/sessions'",
      "app.put('/api/sessions/:id/end'",
      "app.post('/api/interactions'",
      "app.post('/api/predictions'",
      "app.post('/api/quiz-results'",
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

  test('session repository memiliki boundary transaksi lengkap', () => {
    const source = readFileSync(
      path.join(PROJECT_ROOT, 'src/modules/sessions/sessions.repository.ts'),
      'utf8',
    );
    expect(source).toContain('beginTransaction');
    expect(source).toContain('commit');
    expect(source).toContain('rollback');
  });
});
