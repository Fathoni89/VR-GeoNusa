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
const originalLogger = app.locals.logger;
let passwordHash;
let fakeDb;

const schools = [
  { id: 10, name: 'Sekolah A' },
  { id: 20, name: 'Sekolah B' },
];

const classes = [
  { id: 101, class_name: 'Kelas Guru A', school_id: 10, teacher_account_id: 11 },
  { id: 102, class_name: 'Kelas Guru B', school_id: 10, teacher_account_id: 12 },
  { id: 201, class_name: 'Kelas Sekolah B', school_id: 20, teacher_account_id: 21 },
];

const sessions = [
  {
    id: 1001,
    student_name: 'Siswa Guru A',
    school_id: 10,
    school_name: 'Sekolah A',
    class_id: 101,
    class_name: 'Kelas Guru A',
    teacher_account_id: 11,
    scene_name: 'prambanan',
    started_at: '2026-08-14T01:00:00.000Z',
    ended_at: null,
    duration_seconds: 120,
    device_type: 'desktop',
  },
  {
    id: 1002,
    student_name: 'Siswa Guru B',
    school_id: 10,
    school_name: 'Sekolah A',
    class_id: 102,
    class_name: 'Kelas Guru B',
    teacher_account_id: 12,
    scene_name: 'prambanan',
    started_at: '2026-08-14T02:00:00.000Z',
    ended_at: null,
    duration_seconds: 180,
    device_type: 'mobile',
  },
  {
    id: 2001,
    student_name: 'Siswa Sekolah B',
    school_id: 20,
    school_name: 'Sekolah B',
    class_id: 201,
    class_name: 'Kelas Sekolah B',
    teacher_account_id: 21,
    scene_name: 'borobudur',
    started_at: '2026-08-14T03:00:00.000Z',
    ended_at: null,
    duration_seconds: 240,
    device_type: 'desktop',
  },
];

class ReportDb extends FakeDb {
  constructor() {
    super({
      accounts: [
        { id: 1, username: 'super', password_hash: passwordHash, role: 'super_admin', school_id: null },
        { id: 2, username: 'school-a', password_hash: passwordHash, role: 'school_admin', school_id: 10 },
        { id: 11, username: 'teacher-a', password_hash: passwordHash, role: 'teacher', school_id: 10 },
        { id: 12, username: 'teacher-b', password_hash: passwordHash, role: 'teacher', school_id: 10 },
      ],
      students: [
        {
          id: 301,
          name: 'Siswa Login',
          student_number: 'S-LOGIN',
          password_hash: passwordHash,
          school_id: 10,
          class_id: 101,
        },
      ],
      classes,
    });
  }

  reportRows(sql, params) {
    let index = 0;
    let rows = sessions;

    if (sql.includes('s.school_id = ?')) {
      const schoolId = params[index];
      index += 1;
      rows = rows.filter(item => String(item.school_id) === String(schoolId));
    }
    if (sql.includes('report_scope_class.teacher_account_id = ?')) {
      const teacherId = params[index];
      index += 1;
      rows = rows.filter(item => String(item.teacher_account_id) === String(teacherId));
    }
    if (sql.includes('s.class_id = ?')) {
      const classId = params[index];
      rows = rows.filter(item => String(item.class_id) === String(classId));
    }

    return rows;
  }

  async query(sql, params = []) {
    const normalized = normalizeSql(sql);

    if (normalized === 'select id from schools where id = ?') {
      this.calls.push({ sql: normalized, params });
      return [[...schools.filter(item => String(item.id) === String(params[0]))], []];
    }

    if (normalized.startsWith('select id from classes where id = ?')) {
      this.calls.push({ sql: normalized, params });
      let index = 1;
      let rows = classes.filter(item => String(item.id) === String(params[0]));
      if (normalized.includes('school_id = ?')) {
        rows = rows.filter(item => String(item.school_id) === String(params[index]));
        index += 1;
      }
      if (normalized.includes('teacher_account_id = ?')) {
        rows = rows.filter(item => String(item.teacher_account_id) === String(params[index]));
      }
      return [rows.map(item => ({ id: item.id })), []];
    }

    if (normalized.includes('select (select count(*) from sessions s')) {
      this.calls.push({ sql: normalized, params });
      const rows = this.reportRows(normalized, params);
      return [[{
        total_sessions: rows.length,
        total_students: rows.length,
        avg_duration_seconds: rows.length ? 180 : null,
        total_quiz_attempts: 0,
        quiz_accuracy_pct: null,
        total_interactions: 0,
      }], []];
    }

    if (normalized.includes('from quiz_results q join sessions s')) {
      this.calls.push({ sql: normalized, params });
      return [[], []];
    }

    if (normalized.includes('from interactions i') && normalized.includes('join sessions s')) {
      this.calls.push({ sql: normalized, params });
      return [[], []];
    }

    if (normalized.startsWith('select sc.id as school_id')) {
      this.calls.push({ sql: normalized, params });
      const rows = this.reportRows(normalized, params);
      const counts = new Map();
      rows.forEach(item => counts.set(item.school_id, (counts.get(item.school_id) || 0) + 1));
      return [[...counts].map(([schoolId, sessionCount]) => ({
        school_id: schoolId,
        school_name: schools.find(item => item.id === schoolId)?.name,
        session_count: sessionCount,
      })), []];
    }

    if (normalized.startsWith('select id, class_name from classes')) {
      this.calls.push({ sql: normalized, params });
      let index = 0;
      let rows = classes;
      if (normalized.includes('school_id = ?')) {
        rows = rows.filter(item => String(item.school_id) === String(params[index]));
        index += 1;
      }
      if (normalized.includes('teacher_account_id = ?')) {
        rows = rows.filter(item => String(item.teacher_account_id) === String(params[index]));
      }
      return [rows.map(item => ({ id: item.id, class_name: item.class_name })), []];
    }

    if (normalized.startsWith('select c.id as class_id')) {
      this.calls.push({ sql: normalized, params });
      return [[], []];
    }

    if (normalized.startsWith('select count(*) as total from sessions s')) {
      this.calls.push({ sql: normalized, params });
      return [[{ total: this.reportRows(normalized, params).length }], []];
    }

    if (normalized.includes('from sessions s') && normalized.includes('join users u')) {
      this.calls.push({ sql: normalized, params });
      const rows = this.reportRows(normalized, params);
      return [rows.map(item => ({ ...item })), []];
    }

    return super.query(sql, params);
  }
}

beforeAll(async () => {
  passwordHash = await bcrypt.hash('rahasia-test', 4);
});

beforeEach(async () => {
  await staffLoginLimiter.resetKey('127.0.0.1');
  fakeDb = new ReportDb();
  app.locals.dbPool.query = fakeDb.query.bind(fakeDb);
  app.locals.logger = { log() {}, error() {} };
});

afterEach(async () => {
  await staffLoginLimiter.resetKey('127.0.0.1');
  app.locals.dbPool.query = originalQuery;
  app.locals.logger = originalLogger;
});

async function loginStaff(username) {
  return (await request(app)
    .post('/api/auth/login')
    .send({ username, password: 'rahasia-test' })).body.token;
}

async function loginStudent() {
  return (await request(app)
    .post('/api/auth/student-login')
    .send({ school_id: 10, student_number: 'S-LOGIN', password: 'rahasia-test' })).body.token;
}

function authenticatedGet(url, token) {
  return request(app).get(url).set('Authorization', `Bearer ${token}`);
}

function csvIds(text) {
  return text.trim().split('\n').slice(1).map(line => Number(line.split(',')[0].replaceAll('"', '')));
}

test('guru hanya melihat sesi kelas miliknya pada summary dan CSV', async () => {
  const token = await loginStaff('teacher-a');

  const summary = await authenticatedGet('/api/reports/summary', token);
  const csv = await authenticatedGet('/api/reports/export.csv', token);

  expect(summary.status).toBe(200);
  expect(summary.body.data.totals.total_sessions).toBe(1);
  expect(summary.body.data.recentSessions.map(item => item.id)).toEqual([1001]);
  expect(summary.body.data.availableClasses.map(item => item.id)).toEqual([101]);
  expect(csv.status).toBe(200);
  expect(csvIds(csv.text)).toEqual([1001]);
});

describe.each([
  ['guru', 'teacher-a', 102],
  ['school admin', 'school-a', 201],
])('%s dengan filter kelas lintas scope', (_label, username, classId) => {
  test('summary dan CSV sama-sama mengembalikan 403 sebelum query laporan', async () => {
    const token = await loginStaff(username);
    const callsBefore = fakeDb.calls.length;

    const summary = await authenticatedGet(`/api/reports/summary?class_id=${classId}`, token);
    const csv = await authenticatedGet(`/api/reports/export.csv?class_id=${classId}`, token);

    expect(summary.status).toBe(403);
    expect(csv.status).toBe(403);
    expect(summary.body).toEqual(csv.body);
    const newCalls = fakeDb.calls.slice(callsBefore);
    expect(newCalls.filter(call => call.sql.includes('join users u'))).toHaveLength(0);
  });
});

test('school admin tetap melihat sekolah dari token ketika meminta sekolah lain', async () => {
  const token = await loginStaff('school-a');

  const summary = await authenticatedGet('/api/reports/summary?school_id=20', token);
  const csv = await authenticatedGet('/api/reports/export.csv?school_id=20', token);

  expect(summary.status).toBe(200);
  expect(summary.body.data.totals.total_sessions).toBe(2);
  expect(summary.body.data.recentSessions.map(item => item.id)).toEqual([1001, 1002]);
  expect(csvIds(csv.text)).toEqual([1001, 1002]);
});

test('super admin dapat memfilter sekolah valid dengan hasil summary dan CSV identik', async () => {
  const token = await loginStaff('super');

  const summary = await authenticatedGet('/api/reports/summary?school_id=20', token);
  const csv = await authenticatedGet('/api/reports/export.csv?school_id=20', token);

  expect(summary.status).toBe(200);
  expect(summary.body.data.totals.total_sessions).toBe(1);
  expect(summary.body.data.recentSessions.map(item => item.id)).toEqual([2001]);
  expect(summary.body.data.perSchool.map(item => item.school_id)).toEqual([20]);
  expect(csvIds(csv.text)).toEqual([2001]);
});

test('filter numerik tidak valid ditolak sebelum query laporan', async () => {
  const token = await loginStaff('super');

  const invalidSchool = await authenticatedGet('/api/reports/summary?school_id=abc', token);
  const invalidClass = await authenticatedGet('/api/reports/export.csv?class_id=-1', token);

  expect(invalidSchool.status).toBe(400);
  expect(invalidClass.status).toBe(400);
});

test('token siswa tidak dapat membuka summary atau CSV', async () => {
  const token = await loginStudent();

  const summary = await authenticatedGet('/api/reports/summary', token);
  const csv = await authenticatedGet('/api/reports/export.csv', token);

  expect(summary.status).toBe(403);
  expect(csv.status).toBe(403);
});
