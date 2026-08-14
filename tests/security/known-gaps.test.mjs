import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import request from 'supertest';
import { afterEach, beforeEach, expect, test } from 'vitest';

const require = createRequire(import.meta.url);
const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(TEST_DIR, '..', '..');
const { app } = require(path.join(PROJECT_ROOT, 'server.js'));
const { FakeDb } = require(path.join(PROJECT_ROOT, 'tests', 'fixtures', 'fake-db.js'));

const originalQuery = app.locals.dbPool.query;
const originalLogger = app.locals.logger;
let fakeDb;

beforeEach(() => {
  fakeDb = new FakeDb();
  app.locals.dbPool.query = fakeDb.query.bind(fakeDb);
  app.locals.logger = { log() {}, error() {} };
});

afterEach(() => {
  app.locals.dbPool.query = originalQuery;
  app.locals.logger = originalLogger;
});

test('scene ID menolak seluruh bentuk path traversal dan tetap menerima ID valid', async () => {
  const invalidIds = [
    '..%2Fdata%2Fquiz',
    '..%5Cdata%5Cquiz',
    '%2Fetc%2Fpasswd',
    'C:%5CWindows%5Csystem32',
    'bad%00id',
    'UPPER_CASE',
  ];

  for (const id of invalidIds) {
    const response = await request(app).get(`/api/scenes/${id}`);
    expect(response.status, `Kontrak path traversal scene untuk payload ${id}`).toBe(400);
    expect(response.body).toMatchObject({
      success: false,
      message: 'scene_id tidak valid',
    });
  }

  const valid = await request(app).get('/api/scenes/prambanan');
  expect(valid.status, 'ID scene allowlist harus tetap dapat dibaca').toBe(200);
  expect(valid.body).toMatchObject({ success: true, data: { scene_id: 'prambanan' } });
});

test('session event tidak dapat ditulis memakai token pemilik yang salah', async () => {
  const response = await request(app)
    .post('/api/interactions')
    .set('X-Session-Token', 'token-pemilik-yang-salah')
    .send({
      session_id: 999,
      object_code: 'fixture-object',
      interaction_type: 'visit',
    });

  expect(response.status, 'Kontrak ownership session event').toBe(403);
});

test('nilai API admin di-escape sebelum masuk ke HTML', () => {
  const source = readFileSync(path.join(PROJECT_ROOT, 'public', 'admin', 'index.html'), 'utf8');
  const helper = readFileSync(path.join(PROJECT_ROOT, 'public', 'js', 'html-sanitize.js'), 'utf8');

  expect(helper, 'Admin legacy harus memiliki helper escape HTML').toMatch(
    /function\s+escapeHtml\s*\(/
  );
  expect(source).toContain('<script src="/js/html-sanitize.js"></script>');
  expect(source, 'student_name API tidak boleh langsung diinterpolasi').not.toMatch(
    /\$\{s\.student_name\}/
  );
});

test('kegagalan ML tidak mematikan health API non-ML', async () => {
  const prediction = await request(app).post('/api/ml/predict/borobudur/fixture-node');
  const health = await request(app).get('/api/health');

  expect(prediction.status, 'ML yang belum siap harus terdegradasi terkontrol').toBe(503);
  expect(prediction.body).toEqual({
    success: false,
    message: 'Layanan prediksi ML belum siap',
  });
  expect(health.status, 'Health non-ML harus tetap hidup setelah ML gagal').toBe(200);
  expect(health.body).toMatchObject({ success: true, db: 'connected' });
});
