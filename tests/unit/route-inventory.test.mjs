import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, test } from 'vitest';

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(TEST_DIR, '..', '..');

function extractServerRoutes(source) {
  return [...source.matchAll(/\bapp\s*\.\s*(get|post|put|patch|delete)\s*\(\s*(['"])(.*?)\2/g)]
    .map(match => `${match[1].toUpperCase()} ${match[3]}`);
}

function extractRouterRoutes(source, prefix) {
  return [...source.matchAll(/\brouter\s*\.\s*(get|post|put|patch|delete)\s*\(\s*(['"])(.*?)\2/g)]
    .map(match => `${match[1].toUpperCase()} ${prefix}${match[3]}`);
}

function extractInventoryRoutes(markdown) {
  return [...markdown.matchAll(/^\|\s*\d+\s*\|\s*(GET|POST|PUT|PATCH|DELETE)\s*\|\s*`([^`]+)`/gm)]
    .map(match => `${match[1]} ${match[2]}`);
}

function missingRoutes(actual, expected) {
  return expected.filter(route => !actual.includes(route));
}

describe('route inventory contract', () => {
  const serverSource = readFileSync(path.join(PROJECT_ROOT, 'server.js'), 'utf8');
  const authRouterSource = readFileSync(
    path.join(PROJECT_ROOT, 'src', 'modules', 'auth', 'auth.router.ts'),
    'utf8'
  );
  const inventory = readFileSync(
    path.join(PROJECT_ROOT, 'docs', 'architecture', 'api-route-inventory.md'),
    'utf8'
  );
  const serverRoutes = extractServerRoutes(serverSource);
  const authRoutes = extractRouterRoutes(authRouterSource, '/api/auth');
  const actualRoutes = [...serverRoutes, ...authRoutes];
  const expectedRoutes = extractInventoryRoutes(inventory);

  test('seluruh method dan URL baseline tetap terdaftar', () => {
    expect(
      missingRoutes(actualRoutes, expectedRoutes),
      'Kontrak route hilang dari aplikasi'
    ).toEqual([]);
    expect(actualRoutes, 'Jumlah route saat ini tidak sesuai inventory').toHaveLength(53);
  });

  test('detector melaporkan route spesifik yang hilang', () => {
    const withoutLogin = actualRoutes.filter(route => route !== 'POST /api/auth/login');
    expect(missingRoutes(withoutLogin, expectedRoutes)).toEqual(['POST /api/auth/login']);
  });

  test('route auth yang dimigrasikan tidak lagi dideklarasikan sebagai route legacy', () => {
    expect(serverRoutes.filter(route => [
      'POST /api/auth/login',
      'GET /api/auth/verify',
      'POST /api/auth/change-password',
      'POST /api/auth/student-login',
    ].includes(route))).toEqual([]);
  });
});
