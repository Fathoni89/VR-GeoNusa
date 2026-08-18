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
const { FakeDb, normalizeSql } = require(path.join(PROJECT_ROOT, 'tests', 'fixtures', 'fake-db.js'));

const originalQuery = app.locals.dbPool.query;
const originalGetConnection = app.locals.dbPool.getConnection;
const originalLogger = app.locals.logger;
let passwordHash;
let fakeDb;

class ClassesStudentsDb extends FakeDb {
  constructor(options) {
    super(options);
    this.schools = options.schools;
    this.failStudentInsert = false;
    this.transactions = { begun: 0, committed: 0, rolledBack: 0, released: 0 };
  }

  async getConnection() {
    return {
      beginTransaction: async () => { this.transactions.begun += 1; },
      commit: async () => { this.transactions.committed += 1; },
      rollback: async () => { this.transactions.rolledBack += 1; },
      release: () => { this.transactions.released += 1; },
      query: this.query.bind(this),
    };
  }

  async query(sql, params = []) {
    const normalized = normalizeSql(sql);

    if (normalized.includes('from classes c') && normalized.includes('join schools s')) {
      this.calls.push({ sql: normalized, params });
      let rows = this.classes;
      if (normalized.includes('c.school_id = ?')) {
        rows = rows.filter(item => String(item.school_id) === String(params[0]));
      }
      if (normalized.includes('c.teacher_account_id = ?')) {
        rows = rows.filter(item => String(item.teacher_account_id) === String(params[0]));
      }
      return [rows.map(item => ({
        ...item,
        school_name: this.schools.find(school => school.id === item.school_id)?.name,
        teacher_username: this.accounts.find(account => account.id === item.teacher_account_id)?.username,
        student_count: this.students.filter(student => student.class_id === item.id).length,
      })), []];
    }

    if (normalized.includes("select id from accounts where id = ? and role = 'teacher' and school_id = ?")) {
      this.calls.push({ sql: normalized, params });
      const teacher = this.accounts.find(item => String(item.id) === String(params[0])
        && item.role === 'teacher' && String(item.school_id) === String(params[1]));
      return [[teacher ? { id: teacher.id } : undefined].filter(Boolean), []];
    }

    if (normalized.startsWith('insert into classes')) {
      this.calls.push({ sql: normalized, params });
      const classroom = {
        id: this.nextInsertId++, school_id: params[0], teacher_account_id: params[1],
        class_name: params[2], grade_level: params[3], academic_year: params[4],
      };
      this.classes.push(classroom);
      return [{ insertId: classroom.id }, []];
    }

    if (normalized.startsWith('delete from classes where id = ?')) {
      this.calls.push({ sql: normalized, params });
      this.classes = this.classes.filter(item => String(item.id) !== String(params[0]));
      return [{ affectedRows: 1 }, []];
    }

    if (normalized.includes('select id, name, student_number, created_at from students where class_id = ?')) {
      this.calls.push({ sql: normalized, params });
      return [this.students
        .filter(item => String(item.class_id) === String(params[0]))
        .map(({ id, name, student_number, created_at }) => ({ id, name, student_number, created_at })), []];
    }

    if (normalized.includes('select id from students where school_id = ? and student_number = ?')) {
      this.calls.push({ sql: normalized, params });
      const student = this.students.find(item => String(item.school_id) === String(params[0])
        && item.student_number === params[1]);
      return [[student ? { id: student.id } : undefined].filter(Boolean), []];
    }

    if (normalized.startsWith('insert into students')) {
      this.calls.push({ sql: normalized, params });
      if (this.failStudentInsert) throw new Error('simulasi insert siswa gagal');
      const student = {
        id: this.nextInsertId++, school_id: params[0], class_id: Number(params[1]),
        name: params[2], student_number: params[3], password_hash: params[4], auth_version: 0,
      };
      this.students.push(student);
      return [{ insertId: student.id }, []];
    }

    if (normalized.startsWith('delete from students where id = ?')) {
      this.calls.push({ sql: normalized, params });
      this.students = this.students.filter(item => String(item.id) !== String(params[0]));
      return [{ affectedRows: 1 }, []];
    }

    if (normalized.includes('from sessions where student_id = ? order by started_at desc limit 50')) {
      this.calls.push({ sql: normalized, params });
      return [[{ id: 501, scene_name: 'Prambanan', student_id: Number(params[0]) }], []];
    }
    if (normalized.includes('from quiz_results q join sessions s') && normalized.includes('count(*)')) {
      this.calls.push({ sql: normalized, params });
      return [[{ total_attempts: 2, total_correct: 1, accuracy_pct: 50 }], []];
    }
    if (normalized.includes('from quiz_results q join sessions s')) {
      this.calls.push({ sql: normalized, params });
      return [[{ question_id: 'q1', answer: 'a', is_correct: 1 }], []];
    }
    if (normalized.includes('from interactions i join sessions s')) {
      this.calls.push({ sql: normalized, params });
      return [[{ total_interactions: 3 }], []];
    }

    return super.query(sql, params);
  }
}

beforeAll(async () => {
  passwordHash = await bcrypt.hash('rahasia-test', 4);
});

beforeEach(async () => {
  await staffLoginLimiter.resetKey('127.0.0.1');
  fakeDb = new ClassesStudentsDb({
    schools: [{ id: 10, name: 'Sekolah A' }, { id: 20, name: 'Sekolah B' }],
    accounts: [
      { id: 1, username: 'super', password_hash: passwordHash, role: 'super_admin', school_id: null, auth_version: 1 },
      { id: 2, username: 'admin-a', password_hash: passwordHash, role: 'school_admin', school_id: 10, auth_version: 1 },
      { id: 11, username: 'teacher-a', password_hash: passwordHash, role: 'teacher', school_id: 10, auth_version: 1 },
      { id: 12, username: 'teacher-b', password_hash: passwordHash, role: 'teacher', school_id: 20, auth_version: 1 },
    ],
    classes: [
      { id: 101, school_id: 10, teacher_account_id: 11, class_name: 'Kelas A' },
      { id: 102, school_id: 20, teacher_account_id: 12, class_name: 'Kelas B' },
    ],
    students: [
      { id: 201, school_id: 10, class_id: 101, name: 'Ani', student_number: 'A-01', password_hash: passwordHash, auth_version: 1 },
      { id: 202, school_id: 20, class_id: 102, name: 'Budi', student_number: 'B-01', password_hash: passwordHash, auth_version: 1 },
    ],
  });
  app.locals.dbPool.query = fakeDb.query.bind(fakeDb);
  app.locals.dbPool.getConnection = fakeDb.getConnection.bind(fakeDb);
  app.locals.logger = { log() {}, error() {} };
});

afterEach(async () => {
  await staffLoginLimiter.resetKey('127.0.0.1');
  app.locals.dbPool.query = originalQuery;
  app.locals.dbPool.getConnection = originalGetConnection;
  app.locals.logger = originalLogger;
});

async function loginStaff(username) {
  return request(app).post('/api/auth/login').send({ username, password: 'rahasia-test' });
}

async function loginStudent() {
  return request(app).post('/api/auth/student-login').send({
    school_id: 10, student_number: 'A-01', password: 'rahasia-test',
  });
}

describe('classes contract dan tenant isolation', () => {
  test('daftar kelas mengikuti scope role tanpa mengubah response', async () => {
    const superToken = (await loginStaff('super')).body.token;
    const adminToken = (await loginStaff('admin-a')).body.token;
    const teacherToken = (await loginStaff('teacher-a')).body.token;

    const all = await request(app).get('/api/classes').set('Authorization', `Bearer ${superToken}`);
    const school = await request(app).get('/api/classes').set('Authorization', `Bearer ${adminToken}`);
    const own = await request(app).get('/api/classes').set('Authorization', `Bearer ${teacherToken}`);

    expect(all.status).toBe(200);
    expect(all.body.data.map(item => item.id)).toEqual([101, 102]);
    expect(school.body.data.map(item => item.id)).toEqual([101]);
    expect(own.body.data.map(item => item.id)).toEqual([101]);
  });

  test('pembuatan kelas mempertahankan aturan guru dan school_admin', async () => {
    const superToken = (await loginStaff('super')).body.token;
    const adminToken = (await loginStaff('admin-a')).body.token;
    const teacherToken = (await loginStaff('teacher-a')).body.token;

    const superDenied = await request(app).post('/api/classes')
      .set('Authorization', `Bearer ${superToken}`).send({ class_name: 'X' });
    const wrongTeacher = await request(app).post('/api/classes')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ class_name: 'X', teacher_account_id: 12 });
    const created = await request(app).post('/api/classes')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ class_name: 'Kelas Baru', grade_level: '8', academic_year: '2026/2027' });

    expect(superDenied.body).toEqual({ success: false, message: 'super_admin tidak mengajar kelas — buat lewat akun guru' });
    expect(wrongTeacher.body).toEqual({ success: false, message: 'Guru tidak ditemukan di sekolah ini' });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ success: true, data: { class_name: 'Kelas Baru' } });
    expect(fakeDb.classes.at(-1)).toMatchObject({ school_id: 10, teacher_account_id: 11 });
  });

  test.each([
    [{ class_name: 'x'.repeat(101) }],
    [{ class_name: 'Kelas', grade_level: 'x'.repeat(21) }],
    [{ class_name: 'Kelas', academic_year: 'x'.repeat(21) }],
  ])('field kelas dibatasi sesuai schema database', async body => {
    const teacherToken = (await loginStaff('teacher-a')).body.token;
    const response = await request(app).post('/api/classes')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send(body);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ success: false, message: 'Field kelas melebihi panjang maksimum' });
  });

  test('roster dan hapus kelas mempertahankan response sukses baseline', async () => {
    const teacherToken = (await loginStaff('teacher-a')).body.token;
    const roster = await request(app).get('/api/classes/101/students')
      .set('Authorization', `Bearer ${teacherToken}`);
    const deleted = await request(app).delete('/api/classes/101')
      .set('Authorization', `Bearer ${teacherToken}`);

    expect(roster.status).toBe(200);
    expect(roster.body).toEqual({
      success: true,
      data: [{ id: 201, name: 'Ani', student_number: 'A-01' }],
    });
    expect(deleted.status).toBe(200);
    expect(deleted.body).toEqual({
      success: true,
      message: 'Kelas dihapus (siswa di kelas ini tidak ikut terhapus)',
    });
  });

  test('akses roster lintas tenant ditolak sebelum query siswa', async () => {
    const teacherToken = (await loginStaff('teacher-a')).body.token;
    fakeDb.calls = [];
    const response = await request(app).get('/api/classes/102/students')
      .set('Authorization', `Bearer ${teacherToken}`);

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ success: false, message: 'Bukan kelas Anda' });
    expect(fakeDb.calls.some(call => call.sql.includes('from students where class_id'))).toBe(false);
  });
});

describe('bulk students transaction dan validation', () => {
  test('array kosong mempertahankan response validasi baseline', async () => {
    const token = (await loginStaff('teacher-a')).body.token;
    const response = await request(app).post('/api/classes/101/students/bulk')
      .set('Authorization', `Bearer ${token}`).send({ students: [] });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      success: false,
      message: 'Kirim array "students" (minimal 1)',
    });
  });

  test('menolak lebih dari 100 siswa sebelum transaksi', async () => {
    const token = (await loginStaff('teacher-a')).body.token;
    const students = Array.from({ length: 101 }, (_, index) => ({
      name: `Siswa ${index}`, student_number: `N-${index}`,
    }));
    const response = await request(app).post('/api/classes/101/students/bulk')
      .set('Authorization', `Bearer ${token}`).send({ students });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ success: false, message: 'Maksimal 100 siswa per request' });
    expect(fakeDb.transactions.begun).toBe(0);
  });

  test('validasi panjang field dan insert valid berjalan dalam satu transaksi', async () => {
    const token = (await loginStaff('teacher-a')).body.token;
    const response = await request(app).post('/api/classes/101/students/bulk')
      .set('Authorization', `Bearer ${token}`).send({ students: [
        { name: 'x'.repeat(101), student_number: 'LONG-NAME' },
        { name: 'Nomor Panjang', student_number: 'x'.repeat(51) },
        { name: 'Duplikat', student_number: 'A-01' },
        { name: 'Citra', student_number: 'A-02' },
      ] });

    expect(response.status).toBe(201);
    expect(response.body.created).toEqual([
      { id: expect.any(Number), name: 'Citra', student_number: 'A-02', password: expect.stringMatching(/^\d{6}$/) },
    ]);
    expect(response.body.skipped.map(item => item.reason)).toEqual([
      'nama terlalu panjang (maksimal 100 karakter)',
      'nomor induk terlalu panjang (maksimal 50 karakter)',
      'nomor induk sudah dipakai di sekolah ini',
    ]);
    expect(fakeDb.transactions).toEqual({ begun: 1, committed: 1, rolledBack: 0, released: 1 });
  });

  test('kegagalan insert me-rollback transaksi', async () => {
    const token = (await loginStaff('teacher-a')).body.token;
    fakeDb.failStudentInsert = true;
    const response = await request(app).post('/api/classes/101/students/bulk')
      .set('Authorization', `Bearer ${token}`)
      .send({ students: [{ name: 'Citra', student_number: 'A-02' }] });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ success: false, message: 'Internal server error' });
    expect(fakeDb.transactions).toEqual({ begun: 1, committed: 0, rolledBack: 1, released: 1 });
  });
});

describe('student management dan own results', () => {
  test('reset password mencabut token dan akses lintas tenant ditolak', async () => {
    const teacherToken = (await loginStaff('teacher-a')).body.token;
    const studentToken = (await loginStudent()).body.token;
    const reset = await request(app).put('/api/students/201/reset-password')
      .set('Authorization', `Bearer ${teacherToken}`);
    const stale = await request(app).get('/api/auth/verify')
      .set('Authorization', `Bearer ${studentToken}`);
    const crossTenantDelete = await request(app).delete('/api/students/202')
      .set('Authorization', `Bearer ${teacherToken}`);

    expect(reset.status).toBe(200);
    expect(reset.body).toEqual({ success: true, password: expect.stringMatching(/^\d{6}$/) });
    expect(stale.status).toBe(401);
    expect(crossTenantDelete.status).toBe(403);
    expect(crossTenantDelete.body).toEqual({ success: false, message: 'Bukan kelas Anda' });
  });

  test('hapus siswa sendiri dan target tidak ditemukan mempertahankan response baseline', async () => {
    const teacherToken = (await loginStaff('teacher-a')).body.token;
    const deleted = await request(app).delete('/api/students/201')
      .set('Authorization', `Bearer ${teacherToken}`);
    const missing = await request(app).delete('/api/students/999')
      .set('Authorization', `Bearer ${teacherToken}`);

    expect(deleted.status).toBe(200);
    expect(deleted.body).toEqual({ success: true, message: 'Siswa dihapus' });
    expect(missing.status).toBe(404);
    expect(missing.body).toEqual({ success: false, message: 'Siswa tidak ditemukan' });
  });

  test('hasil siswa selalu memakai student_id dari token untuk seluruh query', async () => {
    const token = (await loginStudent()).body.token;
    fakeDb.calls = [];
    const response = await request(app).get('/api/students/me/results')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      data: { name: 'Ani', totals: { total_sessions: 1, total_quiz_attempts: 2, quiz_accuracy_pct: 50, total_interactions: 3 } },
    });
    const resultCalls = fakeDb.calls.filter(call => call.sql.includes('student_id = ?'));
    expect(resultCalls).toHaveLength(4);
    expect(resultCalls.every(call => call.params[0] === 201)).toBe(true);
  });
});
