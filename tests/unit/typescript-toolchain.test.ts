import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..', '..');

function readJson(relativePath: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path.join(PROJECT_ROOT, relativePath), 'utf8')) as Record<string, unknown>;
}

describe('kontrak toolchain TypeScript Fase 4', () => {
  test('konfigurasi mixed JavaScript dan TypeScript bersifat strict untuk TypeScript', () => {
    expect(existsSync(path.join(PROJECT_ROOT, 'tsconfig.json'))).toBe(true);
    const tsconfig = readJson('tsconfig.json');
    const options = tsconfig.compilerOptions as Record<string, unknown>;

    expect(options).toMatchObject({
      strict: true,
      allowJs: true,
      checkJs: false,
      noEmitOnError: true,
      sourceMap: true,
      outDir: 'dist',
    });
  });

  test('package menyediakan seluruh command verifikasi dan mempertahankan rollback legacy', () => {
    const packageJson = readJson('package.json');
    const scripts = packageJson.scripts as Record<string, string>;
    const engines = packageJson.engines as Record<string, string>;

    expect(scripts.typecheck).toContain('tsc');
    expect(scripts.lint).toContain('eslint');
    expect(scripts.test).toBeTruthy();
    expect(scripts.build).toContain('tsc');
    expect(scripts.start).toBe('node server.js');
    expect(scripts['start:build']).toBe('node dist/server.js');
    expect(engines.node).toBe('>=22 <23');
  });

  test('ESLint flat config dan image runtime sama-sama menargetkan Node 22', () => {
    expect(existsSync(path.join(PROJECT_ROOT, 'eslint.config.js'))).toBe(true);
    const dockerfile = readFileSync(path.join(PROJECT_ROOT, 'Dockerfile'), 'utf8');
    expect(dockerfile).toMatch(/^FROM node:22-bookworm-slim/m);
  });
});
