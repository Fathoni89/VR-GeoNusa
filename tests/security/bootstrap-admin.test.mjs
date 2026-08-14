import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';

const require = createRequire(import.meta.url);
const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(TEST_DIR, '..', '..');
const {
  app,
  ensureMustChangePasswordMigration,
  initDb,
  staffLoginLimiter,
} = require(path.join(PROJECT_ROOT, 'server.js'));
const { runtimeEnv } = require(path.join(PROJECT_ROOT, 'src', 'config', 'env'));
const { FakeDb } = require(path.join(PROJECT_ROOT, 'tests', 'fixtures', 'fake-db.js'));

const originalQuery = app.locals.dbPool.query;
const originalLogger = app.locals.logger;
const originalBootstrapPassword = runtimeEnv.BOOTSTRAP_ADMIN_PASSWORD;

class BootstrapDb {
  constructor({ accountCount = 0 } = {}) {
    this.accountCount = accountCount;
    this.calls = [];
  }

  async query(sql, params = []) {
    const normalized = String(sql).replace(/\s+/g, ' ').trim().toLowerCase();
    this.calls.push({ sql: normalized, params });

    if (normalized.startsWith('-- vr-geonusa')) return [{}, []];
    if (normalized.includes('select count(*) as cnt from information_schema.columns')) {
      return [[{ cnt: 1 }], []];
    }
    if (normalized.includes('select is_nullable as is_nullable, column_default as column_default')) {
      return [[{ is_nullable: 'NO', column_default: '0' }], []];
    }
    if (normalized.includes('select column_type as type from information_schema.columns')) {
      return [[{ type: "enum('super_admin','school_admin','teacher')" }], []];
    }
    if (normalized === 'select count(*) as cnt from accounts') {
      return [[{ cnt: this.accountCount }], []];
    }
    if (normalized.startsWith('insert into accounts')) return [{ insertId: 1 }, []];

    throw new Error(`BootstrapDb belum memetakan SQL: ${normalized}`);
  }
}

class LegacyAccountsDb {
  constructor() {
    this.columnState = 'missing';
    this.accounts = [
      { id: 7, username: 'admin', role: 'super_admin', password_hash: 'legacy-hash' },
      { id: 8, username: 'guru', role: 'teacher', password_hash: 'teacher-hash' },
    ];
    this.calls = [];
  }

  async query(sql, params = []) {
    const normalized = String(sql).replace(/\s+/g, ' ').trim().toLowerCase();
    this.calls.push({ sql: normalized, params });

    if (normalized.includes('select is_nullable as is_nullable, column_default as column_default')) {
      if (this.columnState === 'missing') return [[], []];
      if (this.columnState === 'nullable') {
        return [[{ is_nullable: 'YES', column_default: null }], []];
      }
      return [[{ is_nullable: 'NO', column_default: '0' }], []];
    }
    if (normalized.startsWith('alter table accounts add column must_change_password')) {
      this.columnState = 'nullable';
      this.accounts.forEach(account => { account.must_change_password = null; });
      return [{ affectedRows: 0 }, []];
    }
    if (normalized.startsWith('select id from accounts where username = ?')) {
      const account = this.accounts.find(item =>
        item.username === params[0]
        && item.role === params[1]
        && item.must_change_password === null
      );
      return [[account ? { id: account.id } : undefined].filter(Boolean), []];
    }
    if (normalized.startsWith('update accounts set password_hash = ?, must_change_password = true')) {
      const account = this.accounts.find(item =>
        String(item.id) === String(params[1]) && item.must_change_password === null
      );
      if (account) {
        account.password_hash = params[0];
        account.must_change_password = 1;
      }
      return [{ affectedRows: account ? 1 : 0 }, []];
    }
    if (normalized.startsWith('update accounts set must_change_password = false')) {
      this.accounts.forEach(account => {
        if (account.must_change_password === null && account.username !== 'admin') {
          account.must_change_password = 0;
        }
      });
      return [{ affectedRows: 1 }, []];
    }
    if (normalized.startsWith('select count(*) as cnt from accounts where must_change_password is null')) {
      return [[{
        cnt: this.accounts.filter(account => account.must_change_password === null).length,
      }], []];
    }
    if (normalized.startsWith('alter table accounts modify column must_change_password')) {
      this.columnState = 'final';
      return [{ affectedRows: 0 }, []];
    }

    throw new Error(`LegacyAccountsDb belum memetakan SQL: ${normalized}`);
  }
}

beforeEach(async () => {
  await staffLoginLimiter.resetKey('127.0.0.1');
  app.locals.logger = { log() {}, error() {} };
});

afterEach(async () => {
  await staffLoginLimiter.resetKey('127.0.0.1');
  app.locals.dbPool.query = originalQuery;
  app.locals.logger = originalLogger;
  if (originalBootstrapPassword === undefined) delete runtimeEnv.BOOTSTRAP_ADMIN_PASSWORD;
  else runtimeEnv.BOOTSTRAP_ADMIN_PASSWORD = originalBootstrapPassword;
});

describe('bootstrap database kosong', () => {
  test('gagal aman tanpa password bootstrap dan tidak membuat akun', async () => {
    const fakeDb = new BootstrapDb();
    const logs = [];
    delete runtimeEnv.BOOTSTRAP_ADMIN_PASSWORD;
    app.locals.dbPool.query = fakeDb.query.bind(fakeDb);

    await expect(initDb({ logger: { log: (...args) => logs.push(args.join(' ')) } }))
      .rejects.toThrow(/BOOTSTRAP_ADMIN_PASSWORD/);

    expect(fakeDb.calls.some(call => call.sql.startsWith('insert into accounts'))).toBe(false);
    expect(logs.join('\n')).not.toMatch(/password|token/i);
  });

  test('membuat admin dari environment tanpa mencetak atau menyimpan plaintext', async () => {
    const bootstrapPassword = 'sentinel-bootstrap-password';
    const fakeDb = new BootstrapDb();
    const logs = [];
    runtimeEnv.BOOTSTRAP_ADMIN_PASSWORD = bootstrapPassword;
    app.locals.dbPool.query = fakeDb.query.bind(fakeDb);

    await initDb({ logger: { log: (...args) => logs.push(args.join(' ')) } });

    const insert = fakeDb.calls.find(call => call.sql.startsWith('insert into accounts'));
    expect(insert).toBeDefined();
    expect(insert.sql).toContain('must_change_password');
    expect(insert.params).toMatchObject(['admin', expect.any(String), 'super_admin', 1]);
    expect(insert.params).not.toContain(bootstrapPassword);
    expect(await bcrypt.compare(bootstrapPassword, insert.params[1])).toBe(true);
    expect(logs.join('\n')).not.toContain(bootstrapPassword);
    expect(logs.join('\n')).not.toContain('geonusa2026');
  });

  test('database berisi akun tidak memerlukan password bootstrap', async () => {
    const fakeDb = new BootstrapDb({ accountCount: 1 });
    delete runtimeEnv.BOOTSTRAP_ADMIN_PASSWORD;
    app.locals.dbPool.query = fakeDb.query.bind(fakeDb);

    await expect(initDb({ logger: { log() {} } })).resolves.toBeUndefined();
    expect(fakeDb.calls.some(call => call.sql.startsWith('insert into accounts'))).toBe(false);
  });
});

describe('migrasi akun admin legacy', () => {
  test('dapat dilanjutkan setelah secret belum tersedia dan hanya merotasi sekali', async () => {
    const fakeDb = new LegacyAccountsDb();
    const logger = { log() {} };

    await expect(ensureMustChangePasswordMigration({
      dbPool: fakeDb,
      env: { DB_NAME: 'test' },
      logger,
    })).rejects.toThrow(/BOOTSTRAP_ADMIN_PASSWORD/);
    expect(fakeDb.columnState).toBe('nullable');
    expect(fakeDb.accounts[0].password_hash).toBe('legacy-hash');

    await ensureMustChangePasswordMigration({
      dbPool: fakeDb,
      env: { DB_NAME: 'test', BOOTSTRAP_ADMIN_PASSWORD: 'secret-pertama' },
      logger,
    });

    expect(fakeDb.columnState).toBe('final');
    expect(fakeDb.accounts[0].must_change_password).toBe(1);
    expect(await bcrypt.compare('secret-pertama', fakeDb.accounts[0].password_hash)).toBe(true);
    expect(fakeDb.accounts[1].must_change_password).toBe(0);

    const passwordUpdatesBeforeRetry = fakeDb.calls.filter(call =>
      call.sql.startsWith('update accounts set password_hash = ?')
    ).length;
    await ensureMustChangePasswordMigration({
      dbPool: fakeDb,
      env: { DB_NAME: 'test', BOOTSTRAP_ADMIN_PASSWORD: 'secret-kedua' },
      logger,
    });
    const passwordUpdatesAfterRetry = fakeDb.calls.filter(call =>
      call.sql.startsWith('update accounts set password_hash = ?')
    ).length;

    expect(passwordUpdatesAfterRetry).toBe(passwordUpdatesBeforeRetry);
    expect(await bcrypt.compare('secret-pertama', fakeDb.accounts[0].password_hash)).toBe(true);
  });
});

describe('kebijakan wajib ganti password', () => {
  test('admin bootstrap hanya dapat verify dan mengganti password sebelum login ulang', async () => {
    const oldPassword = 'bootstrap-lama';
    const newPassword = 'bootstrap-baru';
    const account = {
      id: 91,
      username: 'admin',
      password_hash: await bcrypt.hash(oldPassword, 4),
      role: 'super_admin',
      school_id: null,
      must_change_password: 1,
    };
    const fakeDb = new FakeDb({ accounts: [account] });
    app.locals.dbPool.query = fakeDb.query.bind(fakeDb);

    const login = await request(app).post('/api/auth/login').send({
      username: 'admin',
      password: oldPassword,
    });

    expect(login.status).toBe(200);
    expect(login.body).toMatchObject({ success: true, must_change_password: true });

    const verify = await request(app)
      .get('/api/auth/verify')
      .set('Authorization', `Bearer ${login.body.token}`);
    expect(verify.status).toBe(200);
    expect(verify.body.must_change_password).toBe(true);

    const forbidden = await request(app)
      .post('/api/schools')
      .set('Authorization', `Bearer ${login.body.token}`)
      .send({ name: 'Tidak boleh dibuat' });
    expect(forbidden.status).toBe(403);
    expect(forbidden.body).toEqual({
      success: false,
      message: 'Password wajib diganti sebelum melanjutkan',
    });

    const changed = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${login.body.token}`)
      .send({ old_password: oldPassword, new_password: newPassword });
    expect(changed.status).toBe(200);
    expect(account.must_change_password).toBe(0);
    expect(await bcrypt.compare(newPassword, account.password_hash)).toBe(true);

    const staleToken = await request(app)
      .post('/api/schools')
      .set('Authorization', `Bearer ${login.body.token}`)
      .send({ name: 'Masih ditolak' });
    expect(staleToken.status).toBe(403);

    const relogin = await request(app).post('/api/auth/login').send({
      username: 'admin',
      password: newPassword,
    });
    expect(relogin.status).toBe(200);
    expect(relogin.body.must_change_password).toBe(false);

    const allowed = await request(app)
      .post('/api/schools')
      .set('Authorization', `Bearer ${relogin.body.token}`)
      .send({ name: 'Sekolah Baru' });
    expect(allowed.status).toBe(201);
  });
});
