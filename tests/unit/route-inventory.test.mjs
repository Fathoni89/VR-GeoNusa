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
    .map(match => `${match[1].toUpperCase()} ${match[3] === '/' ? prefix || '/' : `${prefix}${match[3]}`}`);
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
  const schoolsRouterSource = readFileSync(
    path.join(PROJECT_ROOT, 'src', 'modules', 'schools', 'schools.router.ts'),
    'utf8'
  );
  const accountsRouterSource = readFileSync(
    path.join(PROJECT_ROOT, 'src', 'modules', 'accounts', 'accounts.router.ts'),
    'utf8'
  );
  const classesRouterSource = readFileSync(
    path.join(PROJECT_ROOT, 'src', 'modules', 'classes', 'classes.router.ts'),
    'utf8'
  );
  const studentsRouterSource = readFileSync(
    path.join(PROJECT_ROOT, 'src', 'modules', 'students', 'students.router.ts'),
    'utf8'
  );
  const sessionsRouterSource = readFileSync(
    path.join(PROJECT_ROOT, 'src', 'modules', 'sessions', 'sessions.router.ts'),
    'utf8'
  );
  const learningEventsRouterSource = readFileSync(
    path.join(PROJECT_ROOT, 'src', 'modules', 'learning-events', 'learning-events.router.ts'),
    'utf8'
  );
  const scenesRouterSource = readFileSync(
    path.join(PROJECT_ROOT, 'src', 'modules', 'scenes', 'scenes.router.ts'),
    'utf8'
  );
  const objectsRouterSource = readFileSync(
    path.join(PROJECT_ROOT, 'src', 'modules', 'objects', 'objects.router.ts'),
    'utf8'
  );
  const toursRouterSource = readFileSync(
    path.join(PROJECT_ROOT, 'src', 'modules', 'tours', 'tours.router.ts'),
    'utf8'
  );
  const datasetRouterSource = readFileSync(
    path.join(PROJECT_ROOT, 'src', 'modules', 'dataset', 'dataset.router.ts'),
    'utf8'
  );
  const reportsRouterSource = readFileSync(
    path.join(PROJECT_ROOT, 'src', 'modules', 'reports', 'reports.router.ts'),
    'utf8'
  );
  const teamRouterSource = readFileSync(
    path.join(PROJECT_ROOT, 'src', 'modules', 'team', 'team.router.ts'),
    'utf8'
  );
  const healthRouterSource = readFileSync(
    path.join(PROJECT_ROOT, 'src', 'modules', 'health', 'health.router.ts'),
    'utf8'
  );
  const staticApplicationSource = readFileSync(
    path.join(PROJECT_ROOT, 'src', 'static-application.ts'),
    'utf8'
  );
  const inventory = readFileSync(
    path.join(PROJECT_ROOT, 'docs', 'architecture', 'api-route-inventory.md'),
    'utf8'
  );
  const serverRoutes = extractServerRoutes(serverSource);
  const authRoutes = extractRouterRoutes(authRouterSource, '/api/auth');
  const schoolsRoutes = extractRouterRoutes(schoolsRouterSource, '/api/schools');
  const accountsRoutes = extractRouterRoutes(accountsRouterSource, '/api/accounts');
  const classesRoutes = extractRouterRoutes(classesRouterSource, '/api/classes');
  const studentsRoutes = extractRouterRoutes(studentsRouterSource, '/api/students');
  const sessionsRoutes = extractRouterRoutes(sessionsRouterSource, '/api/sessions');
  const learningEventsRoutes = extractRouterRoutes(learningEventsRouterSource, '/api');
  const scenesRoutes = extractRouterRoutes(scenesRouterSource, '/api/scenes');
  const objectsRoutes = extractRouterRoutes(objectsRouterSource, '/api/scenes');
  const toursRoutes = extractRouterRoutes(toursRouterSource, '/api');
  const datasetRoutes = extractRouterRoutes(datasetRouterSource, '/api/dataset');
  const reportsRoutes = extractRouterRoutes(reportsRouterSource, '/api/reports');
  const teamRoutes = extractRouterRoutes(teamRouterSource, '/api/team');
  const healthRoutes = extractRouterRoutes(healthRouterSource, '/api/health');
  const staticApplicationRoutes = extractRouterRoutes(staticApplicationSource, '');
  const actualRoutes = [
    ...serverRoutes,
    ...authRoutes,
    ...schoolsRoutes,
    ...accountsRoutes,
    ...classesRoutes,
    ...studentsRoutes,
    ...sessionsRoutes,
    ...learningEventsRoutes,
    ...scenesRoutes,
    ...objectsRoutes,
    ...toursRoutes,
    ...datasetRoutes,
    ...reportsRoutes,
    ...teamRoutes,
    ...healthRoutes,
    ...staticApplicationRoutes,
  ];
  const expectedRoutes = extractInventoryRoutes(inventory);

  test('seluruh method dan URL baseline tetap terdaftar', () => {
    expect(
      missingRoutes(actualRoutes, expectedRoutes),
      'Kontrak route hilang dari aplikasi'
    ).toEqual([]);
    expect(actualRoutes, 'Jumlah route saat ini tidak sesuai inventory').toHaveLength(55);
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
      'POST /api/auth/logout',
    ].includes(route))).toEqual([]);
  });

  test('route schools dan accounts yang dimigrasikan tidak lagi dideklarasikan sebagai route legacy', () => {
    expect(serverRoutes.filter(route => [
      'GET /api/schools',
      'POST /api/schools',
      'DELETE /api/schools/:id',
      'GET /api/accounts',
      'POST /api/accounts',
      'PUT /api/accounts/:id/reset-password',
      'DELETE /api/accounts/:id',
    ].includes(route))).toEqual([]);
  });

  test('route classes dan students yang dimigrasikan tidak lagi dideklarasikan sebagai route legacy', () => {
    expect(serverRoutes.filter(route => [
      'GET /api/classes',
      'POST /api/classes',
      'DELETE /api/classes/:id',
      'GET /api/classes/:id/students',
      'POST /api/classes/:id/students/bulk',
      'PUT /api/students/:id/reset-password',
      'DELETE /api/students/:id',
      'GET /api/students/me/results',
    ].includes(route))).toEqual([]);
  });

  test('route sessions dan learning-events yang dimigrasikan tidak lagi dideklarasikan sebagai route legacy', () => {
    expect(serverRoutes.filter(route => [
      'POST /api/sessions',
      'PUT /api/sessions/:id/end',
      'POST /api/interactions',
      'POST /api/predictions',
      'POST /api/quiz-results',
    ].includes(route))).toEqual([]);
  });

  test('route scenes dan objects yang dimigrasikan tidak lagi dideklarasikan sebagai route legacy', () => {
    expect(serverRoutes.filter(route => [
      'GET /api/scenes',
      'GET /api/scenes/:id',
      'POST /api/scenes',
      'PUT /api/scenes/:id',
      'DELETE /api/scenes/:id',
      'GET /api/scenes/:id/objects',
      'POST /api/scenes/:id/objects',
      'PUT /api/scenes/:id/objects/:objId',
      'DELETE /api/scenes/:id/objects/:objId',
    ].includes(route))).toEqual([]);
  });

  test('route tours dan dataset yang dimigrasikan tidak lagi dideklarasikan sebagai route legacy', () => {
    expect(serverRoutes.filter(route => [
      'GET /api/tours',
      'PUT /api/tour/:tourId/folder/:folder',
      'POST /api/dataset/:classId',
      'GET /api/dataset/stats',
    ].includes(route))).toEqual([]);
  });

  test('route reports yang dimigrasikan tidak lagi dideklarasikan sebagai route legacy', () => {
    expect(serverRoutes.filter(route => [
      'GET /api/reports/summary',
      'GET /api/reports/export.csv',
    ].includes(route))).toEqual([]);
  });

  test('route team yang dimigrasikan tidak lagi dideklarasikan sebagai route legacy', () => {
    expect(serverRoutes.filter(route => [
      'GET /api/team',
      'POST /api/team',
      'PUT /api/team/:id',
      'DELETE /api/team/:id',
      'PATCH /api/team/reorder',
      'POST /api/team/:id/photo',
    ].includes(route))).toEqual([]);
  });

  test('route health dan static application tidak lagi dideklarasikan sebagai route legacy', () => {
    expect(serverRoutes.filter(route => [
      'GET /',
      'GET /admin',
      'GET /admin/login',
      'GET /api/ml-placeholder.json',
      'GET /api/health',
      'GET *',
    ].includes(route))).toEqual([]);
  });
});
