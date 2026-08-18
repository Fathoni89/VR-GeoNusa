import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..', '..');
const REQUIRED_MODULES = [
  'src/modules/scenes/scenes.router.ts',
  'src/modules/scenes/scenes.schema.ts',
  'src/modules/scenes/scenes.service.ts',
  'src/modules/scenes/scenes.repository.ts',
  'src/modules/objects/objects.router.ts',
  'src/modules/objects/objects.schema.ts',
  'src/modules/objects/objects.service.ts',
  'src/modules/objects/objects.repository.ts',
] as const;

describe('module scenes dan objects Fase 6E', () => {
  test('router, schema, service, dan repository tersedia', () => {
    for (const relativePath of REQUIRED_MODULES) {
      expect(existsSync(path.join(PROJECT_ROOT, relativePath)), relativePath).toBe(true);
    }
  });

  test('deklarasi route dan helper filesystem legacy sudah dipindahkan', () => {
    const source = readFileSync(path.join(PROJECT_ROOT, 'server.js'), 'utf8');
    const legacyDeclarations = [
      'function readScene(',
      'function writeScene(',
      "app.get('/api/scenes'",
      "app.get('/api/scenes/:id'",
      "app.post('/api/scenes'",
      "app.put('/api/scenes/:id'",
      "app.delete('/api/scenes/:id'",
      "app.get('/api/scenes/:id/objects'",
      "app.post('/api/scenes/:id/objects'",
      "app.put('/api/scenes/:id/objects/:objId'",
      "app.delete('/api/scenes/:id/objects/:objId'",
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

  test('filesystem repository menulis temporary file lalu rename', () => {
    const source = readFileSync(
      path.join(PROJECT_ROOT, 'src/modules/scenes/scenes.repository.ts'),
      'utf8',
    );
    expect(source).toContain('writeFileSync');
    expect(source).toContain('renameSync');
    expect(source).toContain('temporaryPath');
  });
});
