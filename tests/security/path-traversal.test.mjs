import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

const require = createRequire(import.meta.url);
const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(TEST_DIR, '..', '..');
const { app } = require(path.join(PROJECT_ROOT, 'server.js'));
const { FakeDb } = require(path.join(PROJECT_ROOT, 'tests', 'fixtures', 'fake-db.js'));

const originalQuery = app.locals.dbPool.query;
const originalLogger = app.locals.logger;
const invalidIds = [
  '..%2Foutside',
  '..%5Coutside',
  '%2Fetc%2Fpasswd',
  'C:%5CWindows%5Csystem32',
  'bad%00id',
  'UPPER_CASE',
];

let superAdminToken;

beforeAll(async () => {
  const passwordHash = await bcrypt.hash('rahasia-test', 4);
  const fakeDb = new FakeDb({
    accounts: [{
      id: 1,
      username: 'super-path-test',
      password_hash: passwordHash,
      role: 'super_admin',
      school_id: null,
    }],
  });
  app.locals.dbPool.query = fakeDb.query.bind(fakeDb);
  app.locals.logger = { log() {}, error() {} };

  const login = await request(app).post('/api/auth/login').send({
    username: 'super-path-test',
    password: 'rahasia-test',
  });
  superAdminToken = login.body.token;
});

afterAll(() => {
  app.locals.dbPool.query = originalQuery;
  app.locals.logger = originalLogger;
});

function expectInvalidPath(response, label) {
  expect(response.status, `${label} harus ditolak sebelum filesystem I/O`).toBe(400);
  expect(response.body).toMatchObject({ success: false });
  expect(response.body.message).toEqual(expect.any(String));
}

describe('tour dan ML identifiers', () => {
  test.each(invalidIds)('tour ID menolak %s', async payload => {
    const response = await request(app)
      .put(`/api/tour/${payload}/folder/Tambahan%20Halaman`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ class_id: null });

    expectInvalidPath(response, `tour_id ${payload}`);
  });

  test.each(invalidIds)('ML tour ID menolak %s sebelum status readiness', async payload => {
    const response = await request(app).post(
      `/api/ml/predict/${payload}/tambahan-halaman-00`
    );

    expectInvalidPath(response, `ML tour_id ${payload}`);
  });

  test.each(invalidIds)('ML node ID menolak %s sebelum status readiness', async payload => {
    const response = await request(app).post(`/api/ml/predict/borobudur/${payload}`);

    expectInvalidPath(response, `ML node_id ${payload}`);
  });

  test('ID ML valid mempertahankan response 503 ketika model belum siap', async () => {
    const response = await request(app).post(
      '/api/ml/predict/borobudur/tambahan-halaman-00'
    );

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      success: false,
      message: 'Layanan prediksi ML belum siap',
    });
  });
});

describe('dataset dan team photo identifiers', () => {
  test.each(invalidIds)('dataset class ID menolak %s sebelum upload ditulis', async payload => {
    const response = await request(app)
      .post(`/api/dataset/${payload}`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .set('Content-Type', 'image/jpeg')
      .send(Buffer.from([0xff, 0xd8, 0xff]));

    expectInvalidPath(response, `dataset class_id ${payload}`);
  });

  test.each(invalidIds)('team photo ID menolak %s sebelum asset ditulis', async payload => {
    const response = await request(app)
      .post(`/api/team/${payload}/photo`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .set('Content-Type', 'image/jpeg')
      .send(Buffer.from([0xff, 0xd8, 0xff]));

    expectInvalidPath(response, `team_id ${payload}`);
  });

  test('team ID berbahaya ditolak sebelum disimpan untuk upload berikutnya', async () => {
    const response = await request(app)
      .post('/api/team')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ id: '../outside', name: 'Fixture berbahaya' });

    expectInvalidPath(response, 'team_id pada body');
  });
});

test('scene ID berbahaya pada body ditolak, bukan dinormalisasi menjadi file lain', async () => {
  const response = await request(app)
    .post('/api/scenes')
    .set('Authorization', `Bearer ${superAdminToken}`)
    .send({ scene_id: '../outside', name: 'Fixture berbahaya' });

  expectInvalidPath(response, 'scene_id pada body');
});

test('tour ID existing tetap dapat didaftar tanpa mengubah folder display', async () => {
  const response = await request(app).get('/api/tours');

  expect(response.status).toBe(200);
  expect(response.body.data).toEqual(expect.arrayContaining([
    expect.objectContaining({ tour_id: 'borobudur' }),
  ]));
});

test('custom static fallback tidak dapat membaca source di luar public', async () => {
  const response = await request(app).get('/..%5Cserver.js');

  expect(response.status).toBe(200);
  expect(response.headers['content-type']).toMatch(/^text\/html/);
  expect(response.text).not.toContain('Express Backend Server');
});
