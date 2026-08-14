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
const { FakeDb } = require(path.join(PROJECT_ROOT, 'tests', 'fixtures', 'fake-db.js'));

const originalQuery = app.locals.dbPool.query;
const originalLogger = app.locals.logger;
let passwordHash;
let fakeDb;

beforeAll(async () => {
  passwordHash = await bcrypt.hash('rahasia-test', 4);
});

beforeEach(async () => {
  await staffLoginLimiter.resetKey('127.0.0.1');
  fakeDb = new FakeDb({
    accounts: [
      { id: 1, username: 'super', password_hash: passwordHash, role: 'super_admin', school_id: null },
      { id: 2, username: 'school-a', password_hash: passwordHash, role: 'school_admin', school_id: 10 },
      { id: 11, username: 'teacher-a', password_hash: passwordHash, role: 'teacher', school_id: 10 },
      { id: 12, username: 'teacher-b', password_hash: passwordHash, role: 'teacher', school_id: 10 },
    ],
    students: [
      {
        id: 101,
        name: 'Siswa Fixture',
        student_number: 'S-001',
        password_hash: passwordHash,
        school_id: 10,
        class_id: 201,
      },
    ],
    classes: [
      { id: 201, class_name: 'Kelas Guru B', school_id: 10, teacher_account_id: 12 },
      { id: 202, class_name: 'Kelas Sekolah B', school_id: 20, teacher_account_id: 99 },
    ],
  });
  app.locals.dbPool.query = fakeDb.query.bind(fakeDb);
  app.locals.logger = { log() {}, error() {} };
});

afterEach(async () => {
  await staffLoginLimiter.resetKey('127.0.0.1');
  app.locals.dbPool.query = originalQuery;
  app.locals.logger = originalLogger;
});

async function loginStaff(username, password = 'rahasia-test') {
  return request(app).post('/api/auth/login').send({ username, password });
}

async function loginStudent(password = 'rahasia-test') {
  return request(app).post('/api/auth/student-login').send({
    school_id: 10,
    student_number: 'S-001',
    password,
  });
}

describe('login staf', () => {
  test('kredensial valid berhasil dan menghasilkan token dengan role yang sama', async () => {
    const response = await loginStaff('teacher-a');

    expect(response.status, 'Kontrak login staf valid harus sukses').toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      username: 'teacher-a',
      role: 'teacher',
      school_id: 10,
    });
    expect(response.body.token).toEqual(expect.any(String));
  });

  test('password salah dan username tidak dikenal sama-sama ditolak', async () => {
    const wrongPassword = await loginStaff('teacher-a', 'salah');
    const unknownUser = await loginStaff('tidak-ada');

    expect(wrongPassword.status, 'Password staf salah harus ditolak').toBe(401);
    expect(unknownUser.status, 'Username staf tidak dikenal harus ditolak').toBe(401);
    expect(wrongPassword.body.message).toBe(unknownUser.body.message);
  });

  test('lima kegagalan diizinkan lalu percobaan keenam terkena rate limit', async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await loginStaff('teacher-a', 'salah');
      expect(response.status).toBe(401);
    }

    const blocked = await loginStaff('teacher-a', 'salah');

    expect(blocked.status).toBe(429);
    expect(blocked.body).toEqual({
      success: false,
      message: 'Terlalu banyak percobaan login, coba lagi nanti.',
    });
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
  });

  test('login berhasil tidak menghabiskan kuota kegagalan', async () => {
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const response = await loginStaff('teacher-a');
      expect(response.status).toBe(200);
    }
  });
});

describe('login siswa', () => {
  test('kredensial valid berhasil dan menghasilkan token siswa', async () => {
    const response = await loginStudent();

    expect(response.status, 'Kontrak login siswa valid harus sukses').toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      name: 'Siswa Fixture',
      class_id: 201,
      school_id: 10,
    });
    expect(response.body.token).toEqual(expect.any(String));
  });

  test('password salah dan nomor induk tidak dikenal sama-sama ditolak', async () => {
    const wrongPassword = await loginStudent('salah');
    const unknownStudent = await request(app).post('/api/auth/student-login').send({
      school_id: 10,
      student_number: 'S-999',
      password: 'rahasia-test',
    });

    expect(wrongPassword.status, 'Password siswa salah harus ditolak').toBe(401);
    expect(unknownStudent.status, 'Nomor induk tidak dikenal harus ditolak').toBe(401);
    expect(wrongPassword.body.message).toBe(unknownStudent.body.message);
  });
});

test('authorization matrix membedakan super_admin, school_admin, teacher, student, dan guest', async () => {
  const superToken = (await loginStaff('super')).body.token;
  const schoolAdminToken = (await loginStaff('school-a')).body.token;
  const teacherToken = (await loginStaff('teacher-a')).body.token;
  const studentToken = (await loginStudent()).body.token;

  const cases = [
    ['super_admin', superToken, 201],
    ['school_admin', schoolAdminToken, 403],
    ['teacher', teacherToken, 403],
    ['student', studentToken, 403],
    ['guest', null, 401],
  ];

  for (const [role, token, expectedStatus] of cases) {
    const call = request(app).post('/api/schools').send({ name: `Sekolah ${role}` });
    if (token) call.set('Authorization', `Bearer ${token}`);
    const response = await call;
    expect(response.status, `Kontrak authorization role ${role}`).toBe(expectedStatus);
  }
});

test('guru tidak dapat membaca roster kelas milik guru lain', async () => {
  const token = (await loginStaff('teacher-a')).body.token;
  const response = await request(app)
    .get('/api/classes/201/students')
    .set('Authorization', `Bearer ${token}`);

  expect(response.status, 'Kontrak ownership kelas guru').toBe(403);
});

test('school admin tidak dapat membaca kelas sekolah lain', async () => {
  const token = (await loginStaff('school-a')).body.token;
  const response = await request(app)
    .get('/api/classes/202/students')
    .set('Authorization', `Bearer ${token}`);

  expect(response.status, 'Kontrak isolasi sekolah untuk school_admin').toBe(403);
});

test('export CSV menolak request tanpa autentikasi sebelum query database', async () => {
  const response = await request(app).get('/api/reports/export.csv');

  expect(response.status, 'Kontrak autentikasi export CSV').toBe(401);
  expect(fakeDb.calls, 'Guest tidak boleh mencapai query laporan').toHaveLength(0);
});
