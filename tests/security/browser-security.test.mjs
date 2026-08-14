import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest';

const require = createRequire(import.meta.url);
const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(TEST_DIR, '..', '..');
const { app, staffLoginLimiter } = require(path.join(PROJECT_ROOT, 'server.js'));
const { runtimeEnv } = require(path.join(PROJECT_ROOT, 'src', 'config', 'env'));
const { FakeDb } = require(path.join(PROJECT_ROOT, 'tests', 'fixtures', 'fake-db.js'));

const originalQuery = app.locals.dbPool.query;
const originalLogger = app.locals.logger;
const originalNodeEnv = runtimeEnv.NODE_ENV;
let passwordHash;
let fakeDb;

beforeAll(async () => {
  passwordHash = await bcrypt.hash('rahasia-test', 4);
});

beforeEach(async () => {
  await staffLoginLimiter.resetKey('127.0.0.1');
  fakeDb = new FakeDb({
    accounts: [{
      id: 1,
      username: 'admin-cookie',
      password_hash: passwordHash,
      role: 'super_admin',
      school_id: null,
      must_change_password: 0,
    }],
  });
  app.locals.dbPool.query = fakeDb.query.bind(fakeDb);
  app.locals.logger = { log() {}, error() {} };
});

afterEach(async () => {
  await staffLoginLimiter.resetKey('127.0.0.1');
  app.locals.dbPool.query = originalQuery;
  app.locals.logger = originalLogger;
  runtimeEnv.NODE_ENV = originalNodeEnv;
});

function login(mode) {
  const call = request(app).post('/api/auth/login');
  if (mode) call.set('X-Auth-Mode', mode);
  return call.send({ username: 'admin-cookie', password: 'rahasia-test' });
}

test('mode Bearer legacy mempertahankan token dalam response tanpa membuat cookie', async () => {
  const response = await login();

  expect(response.status).toBe(200);
  expect(response.body).toMatchObject({
    success: true,
    token: expect.any(String),
    username: 'admin-cookie',
    role: 'super_admin',
  });
  expect(response.headers['set-cookie']).toBeUndefined();
});

test('mode cookie menyimpan token HttpOnly dan tidak mengekspos token dalam JSON', async () => {
  runtimeEnv.NODE_ENV = 'production';

  const response = await login('cookie');

  expect(response.status).toBe(200);
  expect(response.body).toMatchObject({
    success: true,
    username: 'admin-cookie',
    role: 'super_admin',
  });
  expect(response.body).not.toHaveProperty('token');

  const setCookie = response.headers['set-cookie']?.[0] || '';
  expect(setCookie).toContain('vgn_auth=');
  expect(setCookie).toMatch(/HttpOnly/i);
  expect(setCookie).toMatch(/Secure/i);
  expect(setCookie).toMatch(/SameSite=Strict/i);
  expect(setCookie).toMatch(/Path=\/api/i);
  expect(setCookie).toMatch(/Max-Age=86400/i);
});

test('mode cookie lokal tetap dapat dipakai melalui HTTP tanpa atribut Secure', async () => {
  runtimeEnv.NODE_ENV = 'test';

  const response = await login('cookie');
  const setCookie = response.headers['set-cookie']?.[0] || '';

  expect(response.status).toBe(200);
  expect(setCookie).toContain('vgn_auth=');
  expect(setCookie).not.toMatch(/; Secure/i);
});

test('cookie dapat mengautentikasi verify dan logout menghapus cookie', async () => {
  const loginResponse = await login('cookie');
  const cookie = loginResponse.headers['set-cookie'][0].split(';', 1)[0];

  const verify = await request(app)
    .get('/api/auth/verify')
    .set('Cookie', cookie);
  const logout = await request(app)
    .post('/api/auth/logout')
    .set('Cookie', cookie);

  expect(verify.status).toBe(200);
  expect(verify.body).toMatchObject({ success: true, username: 'admin-cookie' });
  expect(logout.status).toBe(200);
  expect(logout.body).toEqual({ success: true, message: 'Logout berhasil' });
  expect(logout.headers['set-cookie']?.[0]).toMatch(
    /vgn_auth=; Path=\/api; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Strict/i
  );
});

test('logout tetap dapat membersihkan cookie yang tidak valid atau kedaluwarsa', async () => {
  const response = await request(app)
    .post('/api/auth/logout')
    .set('Cookie', 'vgn_auth=token-tidak-valid');

  expect(response.status).toBe(200);
  expect(response.body).toEqual({ success: true, message: 'Logout berhasil' });
  expect(response.headers['set-cookie']?.[0]).toMatch(/vgn_auth=; Path=\/api;/i);
});

test('Helmet mengirim CSP kompatibilitas untuk admin dan VR legacy', async () => {
  const response = await request(app).get('/admin');
  const policy = response.headers['content-security-policy'] || '';

  expect(response.status).toBe(200);
  expect(policy).toContain("default-src 'self'");
  expect(policy).toContain("script-src 'self' 'unsafe-inline' https://aframe.io https://cdn.jsdelivr.net");
  expect(policy).toContain("img-src 'self' data: blob: https://cdn.aframe.io");
  expect(policy).toContain("style-src 'self' 'unsafe-inline'");
  expect(policy).toContain("object-src 'none'");
  expect(policy).toContain("frame-ancestors 'self'");
  expect(response.headers['x-content-type-options']).toBe('nosniff');
});

describe('rendering data API sebagai teks', () => {
  test('escapeHtml menetralkan tag, atribut, kutip, dan ampersand', () => {
    const { escapeHtml, safeTeamPhotoUrl } = require(
      path.join(PROJECT_ROOT, 'public', 'js', 'html-sanitize.js')
    );

    expect(escapeHtml('<img src=x onerror="run()"> & \'test\'')).toBe(
      '&lt;img src=x onerror=&quot;run()&quot;&gt; &amp; &#39;test&#39;'
    );
    expect(safeTeamPhotoUrl('/assets/images/team/fitria-sulistyowati.jpg')).toBe(
      '/assets/images/team/fitria-sulistyowati.jpg'
    );
    expect(safeTeamPhotoUrl('javascript:alert(1)')).toBe('');
  });

  test('nama siswa, sekolah, dan kelas tidak diinterpolasi mentah ke innerHTML admin', () => {
    const source = readFileSync(path.join(PROJECT_ROOT, 'public', 'admin', 'index.html'), 'utf8');

    expect(source).toContain('escapeHtml(s.student_name)');
    expect(source).toContain('escapeHtml(s.school_name');
    expect(source).toContain('escapeHtml(c.class_name)');
    expect(source).not.toMatch(/\$\{s\.student_name\}/);
    expect(source).not.toMatch(/\$\{c\.class_name\}/);
  });
});

test('export laporan memakai authenticated fetch dan download Blob', () => {
  const source = readFileSync(path.join(PROJECT_ROOT, 'public', 'admin', 'index.html'), 'utf8');

  expect(source).toMatch(/async function downloadReportCsv\s*\(/);
  expect(source).toMatch(/apiFetch\(csvUrl/);
  expect(source).toMatch(/await res\.blob\(\)/);
  expect(source).toMatch(/URL\.createObjectURL\(blob\)/);
  expect(source).toContain("a.download = 'vr-geonusa-sessions.csv'");
  expect(source).not.toMatch(/<a href="\$\{csvUrl\}"/);
});
