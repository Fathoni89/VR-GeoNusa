import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..', '..');
const REQUIRED_MODULES = [
  'src/modules/reports/reports.router.ts',
  'src/modules/reports/reports.schema.ts',
  'src/modules/reports/reports.service.ts',
  'src/modules/reports/reports.repository.ts',
] as const;

describe('module reports Fase 6G', () => {
  test('router, schema, service, dan repository tersedia', () => {
    for (const relativePath of REQUIRED_MODULES) {
      expect(existsSync(path.join(PROJECT_ROOT, relativePath)), relativePath).toBe(true);
    }
  });

  test('route dan tenant scope legacy sudah dipindahkan dari server', () => {
    const source = readFileSync(path.join(PROJECT_ROOT, 'server.js'), 'utf8');
    for (const declaration of [
      'function parseReportFilterId(',
      'async function resolveReportScope(',
      "app.get('/api/reports/summary'",
      "app.get('/api/reports/export.csv'",
    ]) {
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

  test('repository menerapkan filter siswa login pada seluruh query sesi', () => {
    const source = readFileSync(
      path.join(PROJECT_ROOT, 'src/modules/reports/reports.repository.ts'),
      'utf8',
    );
    expect(source).toContain('s.student_id IS NOT NULL');
    expect(source).toContain('COUNT(DISTINCT s.student_id)');
  });
});
