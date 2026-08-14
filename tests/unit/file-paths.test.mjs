import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, test } from 'vitest';

const require = createRequire(import.meta.url);
const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(TEST_DIR, '..', '..');
const {
  assertFileIdentifier,
  resolveIdentifierPath,
  resolveWithin,
} = require(path.join(PROJECT_ROOT, 'lib', 'file-paths.js'));

describe('file-backed identifier allowlist', () => {
  test.each([
    '../quiz',
    'folder/child',
    'folder\\child',
    '/etc/passwd',
    'C:\\Windows\\system32',
    'bad\0id',
    'UPPER_CASE',
    'with space',
  ])('menolak identifier tidak aman: %s', value => {
    expect(() => assertFileIdentifier(value, 'fixture_id')).toThrow('fixture_id tidak valid');
  });

  test.each(['prambanan', 'borobudur-360', 'limas-segiempat', 'node-01']) (
    'menerima identifier allowlist: %s',
    value => {
      expect(assertFileIdentifier(value, 'fixture_id')).toBe(value);
    }
  );
});

describe('canonical path containment', () => {
  const root = path.join(PROJECT_ROOT, 'data');

  test('resolveIdentifierPath menghasilkan path canonical di dalam root', () => {
    const resolved = resolveIdentifierPath(root, {
      id: 'prambanan',
      suffix: '.json',
      label: 'scene_id',
    });

    expect(resolved).toBe(path.resolve(root, 'prambanan.json'));
  });

  test.each(['../outside.txt', '..\\outside.txt', '/absolute.txt', 'C:\\outside.txt']) (
    'resolveWithin menolak path yang keluar root: %s',
    value => {
      expect(() => resolveWithin(root, value)).toThrow('Path tidak valid');
    }
  );
});
