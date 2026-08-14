import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest';

const require = createRequire(import.meta.url);
const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(TEST_DIR, '..', '..');
const { app, staffLoginLimiter } = require(path.join(PROJECT_ROOT, 'server.js'));
const { FakeDb } = require(path.join(PROJECT_ROOT, 'tests', 'fixtures', 'fake-db.js'));
const JWT_SECRET = readFileSync(path.join(PROJECT_ROOT, 'config', 'jwt-secret.txt'), 'utf8').trim();

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
      {
        id: 1,
        username: 'super',
        password_hash: passwordHash,
        role: 'super_admin',
        school_id: null,
        auth_version: 2,
      },
      { id: 2, username: 'school-a', password_hash: passwordHash, role: 'school_admin', school_id: 10 },
      {
        id: 11,
        username: 'teacher-a',
        password_hash: passwordHash,
        role: 'teacher',
        school_id: 10,
        must_change_password: 0,
        auth_version: 4,
      },
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
        auth_version: 6,
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

function signLegacyStaffToken(account) {
  return jwt.sign({
    account_id: account.id,
    username: account.username,
    role: account.role,
    school_id: account.school_id,
    must_change_password: false,
  }, JWT_SECRET, { expiresIn: '24h' });
}

function signLegacyStudentToken(student) {
  return jwt.sign({
    student_id: student.id,
    name: student.name,
    role: 'student',
    school_id: student.school_id,
    class_id: student.class_id,
  }, JWT_SECRET, { expiresIn: '12h' });
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
    expect(jwt.decode(response.body.token)).toMatchObject({ auth_version: 4 });
  });

  test('password salah dan username tidak dikenal memiliki response yang sama', async () => {
    const wrongPassword = await loginStaff('teacher-a', 'salah');
    const unknownUser = await loginStaff('tidak-ada');

    expect(wrongPassword.status, 'Password staf salah harus ditolak').toBe(401);
    expect(unknownUser.status, 'Username staf tidak dikenal harus ditolak').toBe(401);
    expect(wrongPassword.body).toEqual({ success: false, message: 'Username atau password salah' });
    expect(unknownUser.body).toEqual(wrongPassword.body);
  });

  test('token staf ditolak setelah account backing token dihapus', async () => {
    const token = (await loginStaff('super')).body.token;
    fakeDb.accounts = fakeDb.accounts.filter(account => account.id !== 1);

    const verify = await request(app)
      .get('/api/auth/verify')
      .set('Authorization', `Bearer ${token}`);
    const protectedRequest = await request(app)
      .post('/api/schools')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Tidak boleh dibuat' });

    expect(verify.status).toBe(401);
    expect(verify.body).toEqual({ success: false, message: 'Token tidak valid atau expired' });
    expect(protectedRequest.status).toBe(401);
    expect(protectedRequest.body).toEqual({
      success: false,
      message: 'Unauthorized — login terlebih dahulu',
    });
    expect(fakeDb.calls.some(call => call.sql.startsWith('insert into schools'))).toBe(false);
  });

  test('authorization memakai role terbaru dari database, bukan snapshot JWT', async () => {
    const token = (await loginStaff('super')).body.token;
    fakeDb.accounts[0].role = 'teacher';
    fakeDb.accounts[0].school_id = 10;

    const response = await request(app)
      .post('/api/schools')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Tidak boleh dibuat' });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      success: false,
      message: 'Tidak punya akses untuk aksi ini',
    });
    expect(fakeDb.calls.some(call => call.sql.startsWith('insert into schools'))).toBe(false);
  });

  test('token staf tanpa auth_version ditolak sebagai token legacy', async () => {
    const token = signLegacyStaffToken(fakeDb.accounts[0]);

    const verify = await request(app)
      .get('/api/auth/verify')
      .set('Authorization', `Bearer ${token}`);
    const protectedRequest = await request(app)
      .post('/api/schools')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Tidak boleh dibuat' });

    expect(verify.status).toBe(401);
    expect(verify.body).toEqual({ success: false, message: 'Token tidak valid atau expired' });
    expect(protectedRequest.status).toBe(401);
    expect(protectedRequest.body).toEqual({
      success: false,
      message: 'Unauthorized — login terlebih dahulu',
    });
  });

  test('perubahan password menaikkan auth_version dan mencabut token lama', async () => {
    const oldToken = (await loginStaff('teacher-a')).body.token;

    const changed = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${oldToken}`)
      .send({ old_password: 'rahasia-test', new_password: 'rahasia-baru' });

    expect(changed.status).toBe(200);
    expect(changed.body).toEqual({ success: true, message: 'Password berhasil diubah' });
    expect(fakeDb.accounts.find(account => account.id === 11)?.auth_version).toBe(5);

    const staleVerify = await request(app)
      .get('/api/auth/verify')
      .set('Authorization', `Bearer ${oldToken}`);
    const staleProtectedRequest = await request(app)
      .get('/api/accounts')
      .set('Authorization', `Bearer ${oldToken}`);
    expect(staleVerify.status).toBe(401);
    expect(staleVerify.body).toEqual({ success: false, message: 'Token tidak valid atau expired' });
    expect(staleProtectedRequest.status).toBe(401);
    expect(staleProtectedRequest.body).toEqual({
      success: false,
      message: 'Unauthorized — login terlebih dahulu',
    });

    const relogin = await loginStaff('teacher-a', 'rahasia-baru');
    expect(relogin.status).toBe(200);
    expect(jwt.decode(relogin.body.token)).toMatchObject({ auth_version: 5 });
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
    expect(jwt.decode(response.body.token)).toMatchObject({ auth_version: 6 });
  });

  test('password salah dan nomor induk tidak dikenal memiliki response yang sama', async () => {
    const wrongPassword = await loginStudent('salah');
    const unknownStudent = await request(app).post('/api/auth/student-login').send({
      school_id: 10,
      student_number: 'S-999',
      password: 'rahasia-test',
    });

    expect(wrongPassword.status, 'Password siswa salah harus ditolak').toBe(401);
    expect(unknownStudent.status, 'Nomor induk tidak dikenal harus ditolak').toBe(401);
    expect(wrongPassword.body).toEqual({ success: false, message: 'Nomor induk atau password salah' });
    expect(unknownStudent.body).toEqual(wrongPassword.body);
  });

  test('token siswa ditolak setelah student backing token dihapus', async () => {
    const token = (await loginStudent()).body.token;
    fakeDb.students = [];

    const response = await request(app)
      .get('/api/students/me/results')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      success: false,
      message: 'Unauthorized — login siswa terlebih dahulu',
    });
  });

  test('token siswa tanpa auth_version ditolak sebagai token legacy', async () => {
    const token = signLegacyStudentToken(fakeDb.students[0]);

    const response = await request(app)
      .get('/api/students/me/results')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      success: false,
      message: 'Unauthorized — login siswa terlebih dahulu',
    });
  });

  test('token siswa ditolak saat auth_version tidak lagi sama', async () => {
    const token = (await loginStudent()).body.token;
    fakeDb.students[0].auth_version += 1;

    const response = await request(app)
      .get('/api/students/me/results')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      success: false,
      message: 'Unauthorized — login siswa terlebih dahulu',
    });
  });
});

describe('revokasi token setelah reset password', () => {
  test('reset password akun oleh super_admin mencabut token staf lama', async () => {
    const superToken = (await loginStaff('super')).body.token;
    const staleTeacherToken = (await loginStaff('teacher-a')).body.token;

    const reset = await request(app)
      .put('/api/accounts/11/reset-password')
      .set('Authorization', `Bearer ${superToken}`)
      .send({ new_password: 'password-reset' });
    const staleVerify = await request(app)
      .get('/api/auth/verify')
      .set('Authorization', `Bearer ${staleTeacherToken}`);

    expect(reset.status).toBe(200);
    expect(reset.body).toEqual({ success: true, message: 'Password akun berhasil direset' });
    expect(staleVerify.status).toBe(401);
    expect(staleVerify.body).toEqual({ success: false, message: 'Token tidak valid atau expired' });
    expect(fakeDb.accounts.find(account => account.id === 11)?.auth_version).toBe(5);
  });

  test('reset password siswa oleh guru berwenang mencabut token siswa lama', async () => {
    const teacherToken = (await loginStaff('teacher-b')).body.token;
    const staleStudentToken = (await loginStudent()).body.token;

    const reset = await request(app)
      .put('/api/students/101/reset-password')
      .set('Authorization', `Bearer ${teacherToken}`);
    const staleVerify = await request(app)
      .get('/api/auth/verify')
      .set('Authorization', `Bearer ${staleStudentToken}`);

    expect(reset.status).toBe(200);
    expect(reset.body).toMatchObject({ success: true, password: expect.any(String) });
    expect(staleVerify.status).toBe(401);
    expect(staleVerify.body).toEqual({ success: false, message: 'Token tidak valid atau expired' });
    expect(fakeDb.students.find(student => student.id === 101)?.auth_version).toBe(7);
  });
});

test('JWT siswa ditolak sebelum route staf menjalankan query kelas', async () => {
  const studentToken = (await loginStudent()).body.token;
  fakeDb.calls = [];

  const response = await request(app)
    .get('/api/classes')
    .set('Authorization', `Bearer ${studentToken}`);

  expect(response.status).toBe(403);
  expect(response.body).toEqual({
    success: false,
    message: 'Tidak punya akses untuk aksi ini',
  });
  expect(fakeDb.calls.some(call => call.sql.includes('from classes'))).toBe(false);
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
