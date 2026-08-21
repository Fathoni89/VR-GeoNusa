import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { assertMigrationApproval } from '../../src/db/migrate';
import { classifyDatabaseTables } from '../../src/db/legacy-baseline';
import { auditOrphans } from '../../src/db/orphan-audit';

const projectRoot = path.resolve(import.meta.dirname, '..', '..');

describe('gate migration database', () => {
  const valid = {
    approved: true,
    backupReference: 'backup:test',
    target: '127.0.0.1:3307/test',
    maintenanceWindow: 'local-test',
  };

  test.each([
    [{ ...valid, approved: false }, /disetujui/],
    [{ ...valid, backupReference: ' ' }, /backup/],
    [{ ...valid, target: 'database-lain' }, /target/],
    [{ ...valid, maintenanceWindow: '' }, /Maintenance window/],
  ])('menolak approval yang tidak lengkap', (approval, message) => {
    expect(() => assertMigrationApproval(approval, valid.target)).toThrow(message);
  });

  test('menerima approval lengkap untuk target yang tepat', () => {
    expect(() => assertMigrationApproval(valid, valid.target)).not.toThrow();
  });
});

describe('klasifikasi baseline', () => {
  const legacyTables = new Set([
    'accounts', 'classes', 'interactions', 'objects', 'predictions',
    'quiz_results', 'schools', 'sessions', 'students', 'users',
  ]);

  test('membedakan fresh, legacy lengkap, versioned, dan schema parsial', () => {
    expect(classifyDatabaseTables(new Set())).toBe('fresh');
    expect(classifyDatabaseTables(legacyTables)).toBe('legacy');
    expect(classifyDatabaseTables(new Set(['__drizzle_migrations']))).toBe('versioned');
    expect(() => classifyDatabaseTables(new Set(['schools']))).toThrow(/parsial/);
  });
});

describe('audit orphan', () => {
  test('melaporkan relasi rusak dan melewati kolom legacy yang belum ada', async () => {
    const tables = ['accounts', 'schools'];
    const columns = [
      { table_name: 'accounts', column_name: 'school_id' },
      { table_name: 'schools', column_name: 'id' },
    ];
    const pool = {
      async query(sql: string) {
        if (sql.includes('information_schema.TABLES')) {
          return [tables.map(table_name => ({ table_name })), []];
        }
        if (sql.includes('information_schema.COLUMNS')) return [columns, []];
        if (sql.includes('FROM accounts child')) return [[{ count: 2 }], []];
        throw new Error(`Query tidak diharapkan: ${sql}`);
      },
    };

    await expect(auditOrphans(pool as never, 'test')).resolves.toEqual([
      { relation: 'accounts.school_id -> schools.id', count: 2 },
    ]);
  });
});

describe('SQL migration hasil review', () => {
  test('memakai snake_case, foreign key eksplisit, index laporan, dan journal versioned', () => {
    const sql = fs.readFileSync(
      path.join(projectRoot, 'src', 'db', 'migrations', '0000_puzzling_preak.sql'),
      'utf8',
    );
    const journal = JSON.parse(fs.readFileSync(
      path.join(projectRoot, 'src', 'db', 'migrations', 'meta', '_journal.json'),
      'utf8',
    ));

    expect(sql).toContain('`write_token_hash` varchar(64)');
    expect(sql).toContain('`must_change_password` boolean NOT NULL DEFAULT false');
    expect(sql).toContain('FOREIGN KEY (`school_id`) REFERENCES `schools`(`id`) ON DELETE restrict');
    expect(sql).toContain('ON DELETE cascade ON UPDATE cascade');
    expect(sql).toContain('ON DELETE set null ON UPDATE cascade');
    expect(sql).toContain('CREATE INDEX `idx_sessions_report_scope`');
    expect(sql).not.toMatch(/`(?:writeTokenHash|mustChangePassword|startedAt)`/);
    expect(journal.entries).toHaveLength(1);
  });
});
