import type { Pool, RowDataPacket } from 'mysql2/promise';

interface CountRow extends RowDataPacket {
  count: number | string;
}

export interface OrphanIssue {
  relation: string;
  count: number;
}

const checks = [
  ['accounts.school_id -> schools.id', 'accounts.school_id', 'schools.id', 'SELECT COUNT(*) AS count FROM accounts child LEFT JOIN schools parent ON parent.id = child.school_id WHERE child.school_id IS NOT NULL AND parent.id IS NULL'],
  ['users.school_id -> schools.id', 'users.school_id', 'schools.id', 'SELECT COUNT(*) AS count FROM users child LEFT JOIN schools parent ON parent.id = child.school_id WHERE child.school_id IS NOT NULL AND parent.id IS NULL'],
  ['classes.school_id -> schools.id', 'classes.school_id', 'schools.id', 'SELECT COUNT(*) AS count FROM classes child LEFT JOIN schools parent ON parent.id = child.school_id WHERE parent.id IS NULL'],
  ['classes.teacher_account_id -> accounts.id', 'classes.teacher_account_id', 'accounts.id', 'SELECT COUNT(*) AS count FROM classes child LEFT JOIN accounts parent ON parent.id = child.teacher_account_id WHERE parent.id IS NULL'],
  ['students.school_id -> schools.id', 'students.school_id', 'schools.id', 'SELECT COUNT(*) AS count FROM students child LEFT JOIN schools parent ON parent.id = child.school_id WHERE parent.id IS NULL'],
  ['students.class_id -> classes.id', 'students.class_id', 'classes.id', 'SELECT COUNT(*) AS count FROM students child LEFT JOIN classes parent ON parent.id = child.class_id WHERE parent.id IS NULL'],
  ['students.school_id = classes.school_id', 'students.school_id', 'classes.school_id', 'SELECT COUNT(*) AS count FROM students child JOIN classes parent ON parent.id = child.class_id WHERE child.school_id <> parent.school_id'],
  ['sessions.user_id -> users.id', 'sessions.user_id', 'users.id', 'SELECT COUNT(*) AS count FROM sessions child LEFT JOIN users parent ON parent.id = child.user_id WHERE child.user_id IS NOT NULL AND parent.id IS NULL'],
  ['sessions.student_id -> students.id', 'sessions.student_id', 'students.id', 'SELECT COUNT(*) AS count FROM sessions child LEFT JOIN students parent ON parent.id = child.student_id WHERE child.student_id IS NOT NULL AND parent.id IS NULL'],
  ['sessions.school_id -> schools.id', 'sessions.school_id', 'schools.id', 'SELECT COUNT(*) AS count FROM sessions child LEFT JOIN schools parent ON parent.id = child.school_id WHERE child.school_id IS NOT NULL AND parent.id IS NULL'],
  ['sessions.class_id -> classes.id', 'sessions.class_id', 'classes.id', 'SELECT COUNT(*) AS count FROM sessions child LEFT JOIN classes parent ON parent.id = child.class_id WHERE child.class_id IS NOT NULL AND parent.id IS NULL'],
  ['predictions.session_id -> sessions.id', 'predictions.session_id', 'sessions.id', 'SELECT COUNT(*) AS count FROM predictions child LEFT JOIN sessions parent ON parent.id = child.session_id WHERE child.session_id IS NOT NULL AND parent.id IS NULL'],
  ['predictions.object_id -> objects.id', 'predictions.object_id', 'objects.id', 'SELECT COUNT(*) AS count FROM predictions child LEFT JOIN objects parent ON parent.id = child.object_id WHERE child.object_id IS NOT NULL AND parent.id IS NULL'],
  ['interactions.session_id -> sessions.id', 'interactions.session_id', 'sessions.id', 'SELECT COUNT(*) AS count FROM interactions child LEFT JOIN sessions parent ON parent.id = child.session_id WHERE child.session_id IS NOT NULL AND parent.id IS NULL'],
  ['interactions.object_id -> objects.id', 'interactions.object_id', 'objects.id', 'SELECT COUNT(*) AS count FROM interactions child LEFT JOIN objects parent ON parent.id = child.object_id WHERE child.object_id IS NOT NULL AND parent.id IS NULL'],
  ['quiz_results.session_id -> sessions.id', 'quiz_results.session_id', 'sessions.id', 'SELECT COUNT(*) AS count FROM quiz_results child LEFT JOIN sessions parent ON parent.id = child.session_id WHERE child.session_id IS NOT NULL AND parent.id IS NULL'],
] as const;

export async function auditOrphans(pool: Pool, databaseName: string): Promise<OrphanIssue[]> {
  const [tableRows] = await pool.query<Array<RowDataPacket & { table_name: string }>>(
    `SELECT TABLE_NAME AS table_name FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = ?`,
    [databaseName],
  );
  const tables = new Set(tableRows.map(row => row.table_name));
  const [columnRows] = await pool.query<Array<RowDataPacket & { table_name: string; column_name: string }>>(
    `SELECT TABLE_NAME AS table_name, COLUMN_NAME AS column_name
     FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ?`,
    [databaseName],
  );
  const columns = new Set(columnRows.map(row => `${row.table_name}.${row.column_name}`));
  const issues: OrphanIssue[] = [];

  for (const [relation, child, parent, query] of checks) {
    const [childTable] = child.split('.');
    const [parentTable] = parent.split('.');
    if (!tables.has(childTable) || !tables.has(parentTable)) continue;
    if (!columns.has(child) || !columns.has(parent)) continue;
    const [rows] = await pool.query<CountRow[]>(query);
    const count = Number(rows[0]?.count ?? 0);
    if (count > 0) issues.push({ relation, count });
  }
  return issues;
}
