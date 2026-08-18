import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..', '..');
const REQUIRED_MODULES = [
  'src/modules/tours/tours.router.ts',
  'src/modules/tours/tours.schema.ts',
  'src/modules/tours/tours.service.ts',
  'src/modules/tours/tours.repository.ts',
  'src/modules/dataset/dataset.router.ts',
  'src/modules/dataset/dataset.schema.ts',
  'src/modules/dataset/dataset.service.ts',
  'src/modules/dataset/dataset.repository.ts',
] as const;

describe('module tours dan dataset Fase 6F', () => {
  test('router, schema, service, dan repository tersedia', () => {
    for (const relativePath of REQUIRED_MODULES) {
      expect(existsSync(path.join(PROJECT_ROOT, relativePath)), relativePath).toBe(true);
    }
  });

  test('deklarasi route dan helper filesystem legacy sudah dipindahkan', () => {
    const source = readFileSync(path.join(PROJECT_ROOT, 'server.js'), 'utf8');
    const legacyDeclarations = [
      'function readGeometryClassIds(',
      'function readTour(',
      'function writeTour(',
      "app.post('/api/dataset/:classId'",
      "app.get('/api/dataset/stats'",
      "app.get('/api/tours'",
      "app.put('/api/tour/:tourId/folder/:folder'",
    ];
    for (const declaration of legacyDeclarations) {
      expect(source, declaration).not.toContain(declaration);
    }
  });

  test('router dan service tidak mengakses filesystem langsung', () => {
    for (const relativePath of REQUIRED_MODULES.filter(file =>
      file.endsWith('.router.ts') || file.endsWith('.service.ts')
    )) {
      const source = readFileSync(path.join(PROJECT_ROOT, relativePath), 'utf8');
      expect(source, relativePath).not.toMatch(/\bfs\./);
      expect(source, relativePath).not.toMatch(/(read|write|rename|unlink)FileSync\s*\(/);
    }
  });

  test('client dataset mengirim provenance tanpa mengubah URL upload', () => {
    const source = readFileSync(path.join(PROJECT_ROOT, 'public', 'js', 'tour.js'), 'utf8');
    expect(source).toContain('`/api/dataset/${classId}`');
    expect(source).toContain("'X-Dataset-Tour-Id'");
    expect(source).toContain("'X-Dataset-Node-Id'");
    expect(source).toContain("'X-Taxonomy-Version'");
  });
});
