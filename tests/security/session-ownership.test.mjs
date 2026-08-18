import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest';

const require = createRequire(import.meta.url);
const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(TEST_DIR, '..', '..');
const { app } = require(path.join(PROJECT_ROOT, 'server.js'));
const { FakeDb } = require(path.join(PROJECT_ROOT, 'tests', 'fixtures', 'fake-db.js'));

const originalQuery = app.locals.dbPool.query;
const originalGetConnection = app.locals.dbPool.getConnection;
const originalLogger = app.locals.logger;
let passwordHash;
let fakeDb;

beforeAll(async () => {
  passwordHash = await bcrypt.hash('rahasia-test', 4);
});

beforeEach(() => {
  fakeDb = new FakeDb({
    students: [
      {
        id: 101,
        name: 'Siswa Satu',
        student_number: 'S-101',
        password_hash: passwordHash,
        school_id: 10,
        class_id: 201,
      },
      {
        id: 102,
        name: 'Siswa Dua',
        student_number: 'S-102',
        password_hash: passwordHash,
        school_id: 10,
        class_id: 201,
      },
    ],
  });
  app.locals.dbPool.query = fakeDb.query.bind(fakeDb);
  app.locals.dbPool.getConnection = fakeDb.getConnection.bind(fakeDb);
  app.locals.logger = { log() {}, error() {} };
});

afterEach(() => {
  app.locals.dbPool.query = originalQuery;
  app.locals.dbPool.getConnection = originalGetConnection;
  app.locals.logger = originalLogger;
});

async function createGuestSession() {
  return request(app).post('/api/sessions').send({
    student_name: 'Tamu Fixture',
    scene_name: 'prambanan',
    device_type: 'desktop',
  });
}

async function loginStudent(studentNumber) {
  return request(app).post('/api/auth/student-login').send({
    school_id: 10,
    student_number: studentNumber,
    password: 'rahasia-test',
  });
}

function mutationRequest(endpoint, sessionId) {
  if (endpoint === 'end') {
    return request(app).put(`/api/sessions/${sessionId}/end`);
  }
  if (endpoint === 'interactions') {
    return request(app).post('/api/interactions').send({
      session_id: sessionId,
      object_code: 'fixture-object',
      interaction_type: 'visit',
    });
  }
  if (endpoint === 'predictions') {
    return request(app).post('/api/predictions').send({
      session_id: sessionId,
      object_code: 'fixture-object',
      predicted_label: 'balok',
      confidence_score: 0.9,
    });
  }
  return request(app).post('/api/quiz-results').send({
    session_id: sessionId,
    question_id: 'q-balok-01',
    answer: 'p × l × t',
    is_correct: true,
    response_time: 2,
  });
}

test('guest menerima token pemilik sementara database hanya menyimpan hash', async () => {
  const response = await createGuestSession();

  expect(response.status).toBe(201);
  expect(response.body).toMatchObject({
    success: true,
    session_id: expect.any(Number),
    session_token: expect.any(String),
  });

  const session = fakeDb.sessions.find(item => item.id === response.body.session_id);
  expect(session.write_token_hash).not.toBe(response.body.session_token);
  expect(session.write_token_hash).toBe(
    crypto.createHash('sha256').update(response.body.session_token).digest('hex')
  );
  expect(fakeDb.transactions).toEqual({ begun: 1, committed: 1, rolledBack: 0, released: 1 });
});

test('kegagalan insert session me-rollback transaksi pembuatan user dan session', async () => {
  fakeDb.failSessionInsert = true;

  const response = await createGuestSession();

  expect(response.status).toBe(500);
  expect(response.body).toEqual({ success: false, message: 'Internal server error' });
  expect(fakeDb.transactions).toEqual({ begun: 1, committed: 0, rolledBack: 1, released: 1 });
});

describe.each(['end', 'interactions', 'predictions', 'quiz-results'])('%s ownership', endpoint => {
  test('token pemilik diterima dan token salah ditolak sebelum write', async () => {
    const created = await createGuestSession();
    const { session_id: sessionId, session_token: sessionToken } = created.body;

    const callsBefore = fakeDb.calls.length;
    const wrong = await mutationRequest(endpoint, sessionId)
      .set('X-Session-Token', 'token-yang-salah');
    expect(wrong.status).toBe(403);
    const rejectedCalls = fakeDb.calls.slice(callsBefore);
    expect(rejectedCalls.some(call =>
      call.sql.startsWith('insert into objects')
      || call.sql.startsWith('insert into interactions')
      || call.sql.startsWith('insert into predictions')
      || call.sql.startsWith('insert into quiz_results')
      || call.sql.startsWith('update sessions set ended_at')
    )).toBe(false);

    const accepted = await mutationRequest(endpoint, sessionId)
      .set('X-Session-Token', sessionToken);
    expect(accepted.status).toBe(endpoint === 'end' ? 200 : 201);
  });
});

test('session ID asing ditolak tanpa menulis object atau event', async () => {
  const callsBefore = fakeDb.calls.length;
  const response = await request(app)
    .post('/api/interactions')
    .set('X-Session-Token', 'token-apa-pun')
    .send({
      session_id: 99999,
      object_code: 'fixture-object',
      interaction_type: 'visit',
    });

  expect(response.status).toBe(403);
  expect(fakeDb.calls.slice(callsBefore).some(call => call.sql.startsWith('insert into objects')))
    .toBe(false);
});

test('JWT siswa hanya dapat menulis ke sesi milik siswa tersebut', async () => {
  const firstLogin = await loginStudent('S-101');
  const secondLogin = await loginStudent('S-102');
  const created = await request(app)
    .post('/api/sessions')
    .set('Authorization', `Bearer ${firstLogin.body.token}`)
    .send({ scene_name: 'prambanan', device_type: 'desktop' });

  expect(created.status).toBe(201);
  expect(created.body).not.toHaveProperty('session_token');

  const forbidden = await mutationRequest('interactions', created.body.session_id)
    .set('Authorization', `Bearer ${secondLogin.body.token}`);
  expect(forbidden.status).toBe(403);

  const accepted = await mutationRequest('interactions', created.body.session_id)
    .set('Authorization', `Bearer ${firstLogin.body.token}`);
  expect(accepted.status).toBe(201);
});
