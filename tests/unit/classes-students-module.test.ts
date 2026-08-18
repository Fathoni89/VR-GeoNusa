import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..', '..');
const REQUIRED_MODULES = [
  'src/modules/classes/classes.router.ts',
  'src/modules/classes/classes.schema.ts',
  'src/modules/classes/classes.service.ts',
  'src/modules/classes/classes.repository.ts',
  'src/modules/students/students.router.ts',
  'src/modules/students/students.schema.ts',
  'src/modules/students/students.service.ts',
  'src/modules/students/students.repository.ts',
] as const;

describe('module classes dan students Fase 6C', () => {
  test('router, schema, service, dan repository tersedia', () => {
    for (const relativePath of REQUIRED_MODULES) {
      expect(existsSync(path.join(PROJECT_ROOT, relativePath)), relativePath).toBe(true);
    }
  });

  test('deklarasi route legacy sudah dipindahkan dari server compatibility', () => {
    const source = readFileSync(path.join(PROJECT_ROOT, 'server.js'), 'utf8');
    const legacyRoutes = [
      "app.get('/api/classes'",
      "app.post('/api/classes'",
      "app.delete('/api/classes/:id'",
      "app.get('/api/classes/:id/students'",
      "app.post('/api/classes/:id/students/bulk'",
      "app.put('/api/students/:id/reset-password'",
      "app.delete('/api/students/:id'",
      "app.get('/api/students/me/results'",
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

  test('bulk repository memiliki boundary transaksi lengkap', () => {
    const source = readFileSync(
      path.join(PROJECT_ROOT, 'src/modules/students/students.repository.ts'),
      'utf8',
    );
    expect(source).toContain('beginTransaction');
    expect(source).toContain('commit');
    expect(source).toContain('rollback');
  });
});
