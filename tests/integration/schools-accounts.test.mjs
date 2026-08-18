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
const {
  FakeDb,
  normalizeSql,
} = require(path.join(PROJECT_ROOT, 'tests', 'fixtures', 'fake-db.js'));

const originalQuery = app.locals.dbPool.query;
const originalLogger = app.locals.logger;
let passwordHash;
let fakeDb;

class SchoolsAccountsDb extends FakeDb {
  constructor(options) {
    super(options);
    this.schools = options.schools;
  }

  async query(sql, params = []) {
    const normalized = normalizeSql(sql);

    if (normalized.startsWith('select id, name from schools order by name')) {
      this.calls.push({ sql: normalized, params });
      const rows = [...this.schools]
        .sort((left, right) => left.name.localeCompare(right.name))
        .map(({ id, name }) => ({ id, name }));
      return [rows, []];
    }

    if (normalized.startsWith('insert into schools')) {
      this.calls.push({ sql: normalized, params });
      const school = { id: this.nextInsertId++, name: params[0], code: params[1] };
      this.schools.push(school);
      return [{ insertId: school.id }, []];
    }

    if (normalized.startsWith('delete from schools where id = ?')) {
      this.calls.push({ sql: normalized, params });
      this.schools = this.schools.filter(school => String(school.id) !== String(params[0]));
      return [{ affectedRows: 1 }, []];
    }

    if (normalized.includes('from accounts a left join schools s')) {
      this.calls.push({ sql: normalized, params });
      const rows = this.accounts
        .filter(account => !normalized.includes('a.school_id = ?')
          || String(account.school_id) === String(params[0]))
        .map(account => ({
          id: account.id,
          username: account.username,
          role: account.role,
          school_id: account.school_id,
          school_name: this.schools.find(school => school.id === account.school_id)?.name ?? null,
          created_at: account.created_at,
        }));
      return [rows, []];
    }

    if (normalized.startsWith('insert into accounts')) {
      this.calls.push({ sql: normalized, params });
      const account = {
        id: this.nextInsertId++,
        username: params[0],
        password_hash: params[1],
        role: params[2],
        school_id: params[3],
        must_change_password: 0,
        auth_version: 0,
      };
      this.accounts.push(account);
      return [{ insertId: account.id }, []];
    }

    if (normalized.startsWith('delete from accounts where id = ?')) {
      this.calls.push({ sql: normalized, params });
      const before = this.accounts.length;
      this.accounts = this.accounts.filter(account => String(account.id) !== String(params[0]));
      return [{ affectedRows: before - this.accounts.length }, []];
    }

    return super.query(sql, params);
  }
}

beforeAll(async () => {
  passwordHash = await bcrypt.hash('rahasia-test', 4);
});

beforeEach(async () => {
  await staffLoginLimiter.resetKey('127.0.0.1');
  fakeDb = new SchoolsAccountsDb({
    schools: [
      { id: 20, name: 'Sekolah B', code: 'B' },
      { id: 10, name: 'Sekolah A', code: 'A' },
    ],
    accounts: [
      { id: 1, username: 'super', password_hash: passwordHash, role: 'super_admin', school_id: null, auth_version: 1 },
      { id: 2, username: 'admin-a', password_hash: passwordHash, role: 'school_admin', school_id: 10, auth_version: 1 },
      { id: 3, username: 'admin-a-2', password_hash: passwordHash, role: 'school_admin', school_id: 10, auth_version: 1 },
      { id: 11, username: 'teacher-a', password_hash: passwordHash, role: 'teacher', school_id: 10, auth_version: 1 },
      { id: 12, username: 'teacher-b', password_hash: passwordHash, role: 'teacher', school_id: 20, auth_version: 1 },
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

async function login(username) {
  return request(app).post('/api/auth/login').send({ username, password: 'rahasia-test' });
}

describe('schools contract', () => {
  test('daftar sekolah tetap publik dan memakai response baseline', async () => {
    const response = await request(app).get('/api/schools');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      data: [
        { id: 10, name: 'Sekolah A' },
        { id: 20, name: 'Sekolah B' },
      ],
    });
  });

  test('hanya super_admin dapat membuat dan menghapus sekolah', async () => {
    const superToken = (await login('super')).body.token;
    const schoolAdminToken = (await login('admin-a')).body.token;

    const forbidden = await request(app)
      .post('/api/schools')
      .set('Authorization', `Bearer ${schoolAdminToken}`)
      .send({ name: 'Sekolah Terlarang' });
    const forbiddenDelete = await request(app)
      .delete('/api/schools/20')
      .set('Authorization', `Bearer ${schoolAdminToken}`);
    const created = await request(app)
      .post('/api/schools')
      .set('Authorization', `Bearer ${superToken}`)
      .send({ name: 'Sekolah C', code: 'C' });
    const deleted = await request(app)
      .delete('/api/schools/20')
      .set('Authorization', `Bearer ${superToken}`);

    expect(forbidden.status).toBe(403);
    expect(forbidden.body).toEqual({ success: false, message: 'Tidak punya akses untuk aksi ini' });
    expect(forbiddenDelete.status).toBe(403);
    expect(forbiddenDelete.body).toEqual({ success: false, message: 'Tidak punya akses untuk aksi ini' });
    expect(created.status).toBe(201);
    expect(created.body).toEqual({
      success: true,
      data: { id: 1000, name: 'Sekolah C', code: 'C' },
    });
    expect(deleted.status).toBe(200);
    expect(deleted.body).toEqual({ success: true, message: 'Sekolah dihapus' });
  });

  test('nama sekolah yang kosong mempertahankan response validasi', async () => {
    const token = (await login('super')).body.token;
    const response = await request(app)
      .post('/api/schools')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ success: false, message: 'name wajib diisi' });
  });
});

describe('accounts tenant authorization', () => {
  test('teacher ditolak service sebelum query daftar akun', async () => {
    const token = (await login('teacher-a')).body.token;
    fakeDb.calls = [];

    const response = await request(app)
      .get('/api/accounts')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ success: false, message: 'Tidak punya akses untuk aksi ini' });
    expect(fakeDb.calls.some(call => call.sql.includes('from accounts a left join schools'))).toBe(false);
  });

  test('super_admin melihat semua akun dan school_admin hanya sekolahnya', async () => {
    const superToken = (await login('super')).body.token;
    const schoolAdminToken = (await login('admin-a')).body.token;

    const allAccounts = await request(app)
      .get('/api/accounts')
      .set('Authorization', `Bearer ${superToken}`);
    const schoolAccounts = await request(app)
      .get('/api/accounts')
      .set('Authorization', `Bearer ${schoolAdminToken}`);

    expect(allAccounts.status).toBe(200);
    expect(allAccounts.body.data.map(account => account.id)).toEqual([1, 2, 3, 11, 12]);
    expect(schoolAccounts.status).toBe(200);
    expect(schoolAccounts.body.data.map(account => account.id)).toEqual([2, 3, 11]);
    expect(schoolAccounts.body.data.some(account => account.password_hash)).toBe(false);
  });

  test('school_admin selalu membuat teacher di sekolah sendiri', async () => {
    const token = (await login('admin-a')).body.token;
    const response = await request(app)
      .post('/api/accounts')
      .set('Authorization', `Bearer ${token}`)
      .send({
        username: 'teacher-new',
        password: 'rahasia-baru',
        role: 'super_admin',
        school_id: 20,
      });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      success: true,
      data: {
        id: 1000,
        username: 'teacher-new',
        role: 'teacher',
        school_id: 10,
      },
    });
    expect(fakeDb.accounts.at(-1)).toMatchObject({ role: 'teacher', school_id: 10 });
  });

  test('akun duplikat mempertahankan response konflik', async () => {
    const token = (await login('super')).body.token;
    const response = await request(app)
      .post('/api/accounts')
      .set('Authorization', `Bearer ${token}`)
      .send({ username: 'teacher-a', password: 'rahasia-baru', role: 'teacher', school_id: 10 });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      success: false,
      message: 'Username "teacher-a" sudah dipakai',
    });
  });

  test('validasi create dan reset account mempertahankan pesan baseline', async () => {
    const token = (await login('super')).body.token;
    const missingCredentials = await request(app)
      .post('/api/accounts')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    const shortPassword = await request(app)
      .post('/api/accounts')
      .set('Authorization', `Bearer ${token}`)
      .send({ username: 'baru', password: '123' });
    const missingSchool = await request(app)
      .post('/api/accounts')
      .set('Authorization', `Bearer ${token}`)
      .send({ username: 'baru', password: 'rahasia-baru', role: 'teacher' });
    const missingTarget = await request(app)
      .put('/api/accounts/999/reset-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ new_password: 'rahasia-baru' });

    expect(missingCredentials.status).toBe(400);
    expect(missingCredentials.body).toEqual({
      success: false,
      message: 'username dan password wajib diisi',
    });
    expect(shortPassword.status).toBe(400);
    expect(shortPassword.body).toEqual({ success: false, message: 'Password minimal 6 karakter' });
    expect(missingSchool.status).toBe(400);
    expect(missingSchool.body).toEqual({
      success: false,
      message: 'school_id wajib untuk akun school_admin/guru',
    });
    expect(missingTarget.status).toBe(404);
    expect(missingTarget.body).toEqual({ success: false, message: 'Akun tidak ditemukan' });
  });

  test('school_admin hanya dapat reset dan hapus teacher sekolah sendiri', async () => {
    const token = (await login('admin-a')).body.token;
    const resetAllowed = await request(app)
      .put('/api/accounts/11/reset-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ new_password: 'password-baru' });
    const resetCrossTenant = await request(app)
      .put('/api/accounts/12/reset-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ new_password: 'password-baru' });
    const deletePeerAdmin = await request(app)
      .delete('/api/accounts/3')
      .set('Authorization', `Bearer ${token}`);

    expect(resetAllowed.status).toBe(200);
    expect(resetAllowed.body).toEqual({ success: true, message: 'Password akun berhasil direset' });
    expect(resetCrossTenant.status).toBe(403);
    expect(resetCrossTenant.body).toEqual({ success: false, message: 'Tidak punya akses untuk akun ini' });
    expect(deletePeerAdmin.status).toBe(403);
    expect(deletePeerAdmin.body).toEqual({ success: false, message: 'Tidak punya akses untuk akun ini' });
  });

  test('akun tidak dapat menghapus dirinya sendiri', async () => {
    const token = (await login('super')).body.token;
    const response = await request(app)
      .delete('/api/accounts/1')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ success: false, message: 'Tidak bisa menghapus akun sendiri' });
  });
});
