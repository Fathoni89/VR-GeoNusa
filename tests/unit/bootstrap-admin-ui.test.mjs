import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, test } from 'vitest';

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(TEST_DIR, '..', '..');

describe('UI wajib ganti password', () => {
  test('admin memaksa Settings dan logout setelah password berhasil diubah', async () => {
    const source = await readFile(path.join(PROJECT_ROOT, 'public', 'admin', 'index.html'), 'utf8');

    expect(source).toContain('mustChangePassword: false');
    expect(source.match(/state\.mustChangePassword\s*=\s*json\.must_change_password === true/g))
      .toHaveLength(2);
    expect(source).toMatch(/if \(state\.mustChangePassword\) state\.currentPage = 'settings'/);
    expect(source).toMatch(/if \(state\.mustChangePassword && page !== 'settings'\) page = 'settings'/);
    expect(source).toMatch(/if \(json\.success\)[\s\S]{0,300}doLogout\(\)/);
  });

  test('login dataset tidak menyimpan token admin yang masih wajib ganti password', async () => {
    const source = await readFile(path.join(PROJECT_ROOT, 'public', 'js', 'tour.js'), 'utf8');
    const forcedChangeIndex = source.indexOf('if (json.must_change_password === true)');
    const storeTokenIndex = source.indexOf("localStorage.setItem('vgn_token', json.token)");

    expect(forcedChangeIndex).toBeGreaterThan(-1);
    expect(forcedChangeIndex).toBeLessThan(storeTokenIndex);
  });
});
