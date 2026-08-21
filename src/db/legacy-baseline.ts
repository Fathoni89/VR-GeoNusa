import bcrypt from 'bcryptjs';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import type { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';

const applicationTables = [
  'accounts',
  'classes',
  'interactions',
  'objects',
  'predictions',
  'quiz_results',
  'schools',
  'sessions',
  'students',
  'users',
] as const;

const legacyColumns = [
  ['sessions', 'student_id', 'student_id INT NULL'],
  ['sessions', 'school_id', 'school_id INT NULL'],
  ['sessions', 'class_id', 'class_id INT NULL'],
  ['sessions', 'write_token_hash', 'write_token_hash VARCHAR(64) NULL'],
  ['accounts', 'auth_version', 'auth_version INT UNSIGNED NOT NULL DEFAULT 0'],
  ['students', 'auth_version', 'auth_version INT UNSIGNED NOT NULL DEFAULT 0'],
] as const;

const indexes = [
  ['accounts', 'idx_accounts_school', ['school_id']],
  ['classes', 'idx_classes_school', ['school_id']],
  ['classes', 'idx_classes_teacher', ['teacher_account_id']],
  ['interactions', 'idx_interactions_session', ['session_id']],
  ['interactions', 'idx_interactions_object', ['object_id']],
  ['predictions', 'idx_predictions_session', ['session_id']],
  ['predictions', 'idx_predictions_object', ['object_id']],
  ['quiz_results', 'idx_quiz_results_session', ['session_id']],
  ['quiz_results', 'idx_quiz_results_question', ['question_id']],
  ['sessions', 'idx_sessions_user', ['user_id']],
  ['sessions', 'idx_sessions_student', ['student_id']],
  ['sessions', 'idx_sessions_school', ['school_id']],
  ['sessions', 'idx_sessions_class', ['class_id']],
  ['sessions', 'idx_sessions_started', ['started_at']],
  ['sessions', 'idx_sessions_report_scope', ['school_id', 'class_id', 'student_id', 'started_at']],
  ['students', 'idx_students_class', ['class_id']],
  ['users', 'idx_users_school', ['school_id']],
] as const;

const foreignKeys = [
  ['accounts', 'school_id', 'schools', 'id', 'accounts_school_id_schools_id_fk', 'RESTRICT'],
  ['classes', 'school_id', 'schools', 'id', 'classes_school_id_schools_id_fk', 'RESTRICT'],
  ['classes', 'teacher_account_id', 'accounts', 'id', 'classes_teacher_account_id_accounts_id_fk', 'RESTRICT'],
  ['interactions', 'session_id', 'sessions', 'id', 'interactions_session_id_sessions_id_fk', 'CASCADE'],
  ['interactions', 'object_id', 'objects', 'id', 'interactions_object_id_objects_id_fk', 'SET NULL'],
  ['predictions', 'session_id', 'sessions', 'id', 'predictions_session_id_sessions_id_fk', 'CASCADE'],
  ['predictions', 'object_id', 'objects', 'id', 'predictions_object_id_objects_id_fk', 'SET NULL'],
  ['quiz_results', 'session_id', 'sessions', 'id', 'quiz_results_session_id_sessions_id_fk', 'CASCADE'],
  ['sessions', 'user_id', 'users', 'id', 'sessions_user_id_users_id_fk', 'SET NULL'],
  ['sessions', 'student_id', 'students', 'id', 'sessions_student_id_students_id_fk', 'SET NULL'],
  ['sessions', 'school_id', 'schools', 'id', 'sessions_school_id_schools_id_fk', 'SET NULL'],
  ['sessions', 'class_id', 'classes', 'id', 'sessions_class_id_classes_id_fk', 'SET NULL'],
  ['students', 'school_id', 'schools', 'id', 'students_school_id_schools_id_fk', 'RESTRICT'],
  ['students', 'class_id', 'classes', 'id', 'students_class_id_classes_id_fk', 'RESTRICT'],
  ['users', 'school_id', 'schools', 'id', 'users_school_id_schools_id_fk', 'SET NULL'],
] as const;

interface CountRow extends RowDataPacket {
  count: number | string;
}

interface ColumnRow extends RowDataPacket {
  is_nullable: string;
  column_type: string;
}

interface ForeignKeyRow extends RowDataPacket {
  constraint_name: string;
  referenced_table_name: string;
  referenced_column_name: string;
  delete_rule: string;
  update_rule: string;
}

export type DatabaseState = 'fresh' | 'legacy' | 'versioned';

async function tableNames(pool: Pool, databaseName: string): Promise<Set<string>> {
  const [rows] = await pool.query<Array<RowDataPacket & { table_name: string }>>(
    `SELECT TABLE_NAME AS table_name FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = ?`,
    [databaseName],
  );
  return new Set(rows.map(row => row.table_name));
}

export function classifyDatabaseTables(tables: ReadonlySet<string>): DatabaseState {
  if (tables.has('__drizzle_migrations')) return 'versioned';
  const present = applicationTables.filter(table => tables.has(table));
  if (present.length === 0) return 'fresh';
  if (present.length === applicationTables.length) return 'legacy';
  const missing = applicationTables.filter(table => !tables.has(table));
  throw new Error(`Schema database parsial tidak didukung; tabel kurang: ${missing.join(', ')}`);
}

export async function detectDatabaseState(pool: Pool, databaseName: string): Promise<DatabaseState> {
  return classifyDatabaseTables(await tableNames(pool, databaseName));
}

async function column(pool: Pool, databaseName: string, table: string, name: string) {
  const [rows] = await pool.query<ColumnRow[]>(
    `SELECT IS_NULLABLE AS is_nullable, COLUMN_TYPE AS column_type
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [databaseName, table, name],
  );
  return rows[0];
}

async function ensureColumn(
  pool: Pool,
  databaseName: string,
  table: string,
  name: string,
  definition: string,
): Promise<void> {
  if (await column(pool, databaseName, table, name)) return;
  await pool.query(`ALTER TABLE \`${table}\` ADD COLUMN ${definition}`);
}

async function ensureAccountsRole(pool: Pool, databaseName: string): Promise<void> {
  const role = await column(pool, databaseName, 'accounts', 'role');
  if (!role) throw new Error('Schema legacy tidak memiliki accounts.role');
  if (role.column_type.includes('school_admin')) return;
  await pool.query(
    "ALTER TABLE accounts MODIFY COLUMN role ENUM('super_admin','school_admin','teacher') NOT NULL DEFAULT 'teacher'",
  );
}

export async function ensureMustChangePasswordMigration(
  pool: Pool,
  databaseName: string,
  bootstrapPassword?: string,
): Promise<void> {
  let state = await column(pool, databaseName, 'accounts', 'must_change_password');
  if (!state) {
    await pool.query('ALTER TABLE accounts ADD COLUMN must_change_password BOOLEAN NULL DEFAULT NULL');
    state = { is_nullable: 'YES', column_type: 'tinyint(1)' } as ColumnRow;
  }
  if (state.is_nullable.toUpperCase() !== 'YES') return;

  const [[legacyAdmin]] = await pool.query<Array<RowDataPacket & { id: number }>>(
    `SELECT id FROM accounts
     WHERE username = ? AND role = ? AND must_change_password IS NULL LIMIT 1`,
    ['admin', 'super_admin'],
  );
  if (legacyAdmin) {
    if (!bootstrapPassword) {
      throw new Error('BOOTSTRAP_ADMIN_PASSWORD wajib diisi untuk memigrasikan admin legacy');
    }
    const [result] = await pool.query<ResultSetHeader>(
      `UPDATE accounts SET password_hash = ?, must_change_password = TRUE
       WHERE id = ? AND must_change_password IS NULL`,
      [await bcrypt.hash(bootstrapPassword, 10), legacyAdmin.id],
    );
    if (result.affectedRows !== 1) {
      throw new Error('Rotasi password admin legacy tidak berhasil');
    }
  }
  await pool.query(
    `UPDATE accounts SET must_change_password = FALSE
     WHERE must_change_password IS NULL
       AND NOT (username = 'admin' AND role = 'super_admin')`,
  );
  const [[remaining]] = await pool.query<CountRow[]>(
    'SELECT COUNT(*) AS count FROM accounts WHERE must_change_password IS NULL',
  );
  if (Number(remaining.count) !== 0) {
    throw new Error('Migrasi must_change_password belum dapat diselesaikan dengan aman');
  }
  await pool.query(
    'ALTER TABLE accounts MODIFY COLUMN must_change_password BOOLEAN NOT NULL DEFAULT FALSE',
  );
}

async function hasIndex(pool: Pool, databaseName: string, table: string, columns: readonly string[]) {
  const [rows] = await pool.query<Array<RowDataPacket & { index_name: string; column_name: string }>>(
    `SELECT INDEX_NAME AS index_name, COLUMN_NAME AS column_name
     FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
     ORDER BY INDEX_NAME, SEQ_IN_INDEX`,
    [databaseName, table],
  );
  const grouped = new Map<string, string[]>();
  for (const row of rows) {
    const existing = grouped.get(row.index_name) ?? [];
    existing.push(row.column_name);
    grouped.set(row.index_name, existing);
  }
  return [...grouped.values()].some(value => value.join(',') === columns.join(','));
}

async function ensureIndex(
  pool: Pool,
  databaseName: string,
  table: string,
  name: string,
  columns: readonly string[],
): Promise<void> {
  if (await hasIndex(pool, databaseName, table, columns)) return;
  const list = columns.map(item => `\`${item}\``).join(', ');
  await pool.query(`CREATE INDEX \`${name}\` ON \`${table}\` (${list})`);
}

async function ensureForeignKey(
  pool: Pool,
  databaseName: string,
  table: string,
  childColumn: string,
  parentTable: string,
  parentColumn: string,
  name: string,
  deleteRule: string,
): Promise<void> {
  const [rows] = await pool.query<ForeignKeyRow[]>(
    `SELECT k.CONSTRAINT_NAME AS constraint_name,
            k.REFERENCED_TABLE_NAME AS referenced_table_name,
            k.REFERENCED_COLUMN_NAME AS referenced_column_name,
            r.DELETE_RULE AS delete_rule,
            r.UPDATE_RULE AS update_rule
     FROM information_schema.KEY_COLUMN_USAGE k
     JOIN information_schema.REFERENTIAL_CONSTRAINTS r
       ON r.CONSTRAINT_SCHEMA = k.CONSTRAINT_SCHEMA
      AND r.CONSTRAINT_NAME = k.CONSTRAINT_NAME
     WHERE k.TABLE_SCHEMA = ? AND k.TABLE_NAME = ? AND k.COLUMN_NAME = ?
       AND k.REFERENCED_TABLE_NAME IS NOT NULL`,
    [databaseName, table, childColumn],
  );
  const expected = rows.find(row =>
    row.referenced_table_name === parentTable
    && row.referenced_column_name === parentColumn
    && row.delete_rule === deleteRule
    && row.update_rule === 'CASCADE'
  );
  if (expected) return;
  if (rows.length > 0) {
    throw new Error(`Foreign key konflik pada ${table}.${childColumn}: ${rows[0].constraint_name}`);
  }
  await pool.query(
    `ALTER TABLE \`${table}\` ADD CONSTRAINT \`${name}\` FOREIGN KEY (\`${childColumn}\`) `
    + `REFERENCES \`${parentTable}\` (\`${parentColumn}\`) ON DELETE ${deleteRule} ON UPDATE CASCADE`,
  );
}

export async function upgradeLegacySchema(
  pool: Pool,
  databaseName: string,
  bootstrapPassword?: string,
): Promise<void> {
  for (const [table, name, definition] of legacyColumns) {
    await ensureColumn(pool, databaseName, table, name, definition);
  }
  await ensureAccountsRole(pool, databaseName);
  await ensureMustChangePasswordMigration(pool, databaseName, bootstrapPassword);
  for (const [table, name, columns] of indexes) {
    await ensureIndex(pool, databaseName, table, name, columns);
  }
  for (const [table, child, parentTable, parent, name, deleteRule] of foreignKeys) {
    await ensureForeignKey(pool, databaseName, table, child, parentTable, parent, name, deleteRule);
  }
}

export async function markLegacyBaseline(
  pool: Pool,
  migrationsFolder: string,
): Promise<void> {
  const [initial] = readMigrationFiles({ migrationsFolder });
  if (!initial) throw new Error('Migration awal Drizzle tidak ditemukan');
  await pool.query(
    `CREATE TABLE IF NOT EXISTS __drizzle_migrations (
       id SERIAL PRIMARY KEY,
       hash TEXT NOT NULL,
       created_at BIGINT
     )`,
  );
  const [[existing]] = await pool.query<CountRow[]>(
    'SELECT COUNT(*) AS count FROM __drizzle_migrations',
  );
  if (Number(existing.count) > 0) {
    throw new Error('Journal Drizzle tidak kosong; baseline legacy dibatalkan');
  }
  await pool.query(
    'INSERT INTO __drizzle_migrations (`hash`, `created_at`) VALUES (?, ?)',
    [initial.hash, initial.folderMillis],
  );
}
