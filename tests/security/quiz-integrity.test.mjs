import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';

const require = createRequire(import.meta.url);
const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(TEST_DIR, '..', '..');
const { app } = require(path.join(PROJECT_ROOT, 'server.js'));
const { FakeDb } = require(path.join(PROJECT_ROOT, 'tests', 'fixtures', 'fake-db.js'));

const originalQuery = app.locals.dbPool.query;
const originalLogger = app.locals.logger;
let fakeDb;
let sessionId;
let sessionToken;

beforeEach(async () => {
  fakeDb = new FakeDb();
  app.locals.dbPool.query = fakeDb.query.bind(fakeDb);
  app.locals.logger = { log() {}, error() {} };

  const created = await request(app).post('/api/sessions').send({
    student_name: 'Tamu Kuis',
    scene_name: 'prambanan',
    device_type: 'desktop',
  });
  sessionId = created.body.session_id;
  sessionToken = created.body.session_token;
});

afterEach(() => {
  app.locals.dbPool.query = originalQuery;
  app.locals.logger = originalLogger;
});

function submitQuiz(payload) {
  return request(app)
    .post('/api/quiz-results')
    .set('X-Session-Token', sessionToken)
    .send({ session_id: sessionId, ...payload });
}

function latestQuizInsert() {
  return fakeDb.calls.findLast(call => call.sql.startsWith('insert into quiz_results'));
}

test('server mengabaikan is_correct palsu dan menilai jawaban salah', async () => {
  const response = await submitQuiz({
    question_id: 'q-balok-01',
    answer: 's³',
    is_correct: true,
    response_time: 12,
  });

  expect(response.status).toBe(201);
  expect(latestQuizInsert().params).toEqual([sessionId, 'q-balok-01', 's³', 0, 12]);
});

test('server menilai jawaban benar walaupun client mengirim is_correct false', async () => {
  const response = await submitQuiz({
    question_id: 'q-balok-01',
    answer: 'p × l × t',
    is_correct: false,
    response_time: 0,
  });

  expect(response.status).toBe(201);
  expect(latestQuizInsert().params).toEqual([
    sessionId,
    'q-balok-01',
    'p × l × t',
    1,
    0,
  ]);
});

describe.each([
  ['question ID tidak dikenal', { question_id: 'q-tidak-ada', answer: '1', response_time: 5 }],
  ['jawaban bukan opsi soal', { question_id: 'q-balok-01', answer: 'jawaban-rekayasa', response_time: 5 }],
  ['jawaban kosong', { question_id: 'q-balok-01', answer: '', response_time: 5 }],
])('%s', (_label, payload) => {
  test('ditolak sebelum insert', async () => {
    const response = await submitQuiz(payload);

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ success: false });
    expect(latestQuizInsert()).toBeUndefined();
  });
});

describe.each([
  ['negatif', -1],
  ['lebih dari 10 menit', 601],
  ['string angka', '5'],
])('response_time %s', (_label, responseTime) => {
  test('ditolak sebelum insert', async () => {
    const response = await submitQuiz({
      question_id: 'q-balok-01',
      answer: 'p × l × t',
      response_time: responseTime,
    });

    expect(response.status).toBe(400);
    expect(latestQuizInsert()).toBeUndefined();
  });
});

test.each([null, 600])('response_time %s tetap diterima', async responseTime => {
  const response = await submitQuiz({
    question_id: 'q-balok-01',
    answer: 'p × l × t',
    response_time: responseTime,
  });

  expect(response.status).toBe(201);
  expect(latestQuizInsert().params[4]).toBe(responseTime);
});
