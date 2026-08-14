import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, test } from 'vitest';

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(TEST_DIR, '..', '..');

describe.each(['public/js/app.js', 'public/js/tour.js'])('%s session ownership client', file => {
  test('menyimpan token sesi di memory dan mengirim bukti ownership', async () => {
    const source = await readFile(path.join(PROJECT_ROOT, file), 'utf8');

    expect(source).toMatch(/let sessionWriteToken = null/);
    expect(source).toMatch(/sessionWriteToken = json\.session_token \|\| null/);
    expect(source).toContain("headers['X-Session-Token'] = sessionWriteToken");
    expect(source).toContain("headers.Authorization = 'Bearer ' + studentAuthToken");
    expect(source).not.toMatch(/localStorage\.setItem\([^)]*session/i);
  });
});

test('schema development mencakup hash token sesi, bukan token plaintext', async () => {
  const schema = await readFile(path.join(PROJECT_ROOT, 'db', 'schema.mysql.sql'), 'utf8');

  expect(schema).toMatch(/write_token_hash\s+VARCHAR\(64\)\s+NULL/);
  expect(schema).not.toMatch(/\bwrite_token\s+/);
});

describe.each(['public/js/app.js', 'public/js/tour.js'])('%s quiz payload', file => {
  test('tidak mengirim hasil penilaian client ke server', async () => {
    const source = await readFile(path.join(PROJECT_ROOT, file), 'utf8');
    const quizRequest = source.slice(
      source.indexOf("fetch('/api/quiz-results'"),
      source.indexOf("fetch('/api/quiz-results'") + 500
    );

    expect(quizRequest).toContain('question_id');
    expect(quizRequest).toContain('answer');
    expect(quizRequest).not.toContain('is_correct');
  });
});
