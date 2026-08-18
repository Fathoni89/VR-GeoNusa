import type {
  Pool,
  PoolConnection,
  ResultSetHeader,
  RowDataPacket,
} from 'mysql2/promise';

export interface StudentRecord extends RowDataPacket {
  id: number;
  school_id: number;
  class_id: number;
  name: string;
  student_number: string;
  password_hash: string;
  auth_version: number;
  created_at: unknown;
}

export interface StudentRosterRow extends RowDataPacket {
  id: number;
  name: string;
  student_number: string;
  created_at: unknown;
}

export interface PreparedStudent {
  index: number;
  source: Record<string, unknown>;
  name: string;
  studentNumber: string;
  plainPassword: string;
  passwordHash: string;
}

export interface CreatedStudent {
  id: number;
  name: string;
  student_number: string;
  password: string;
}

export interface SkippedStudent extends Record<string, unknown> {
  reason: string;
}

export interface BulkRepositoryResult {
  created: CreatedStudent[];
  skipped: Array<{ index: number; value: SkippedStudent }>;
}

export interface StudentResults {
  sessions: RowDataPacket[];
  quizTotals: RowDataPacket;
  perQuestion: RowDataPacket[];
  interactionTotals: RowDataPacket;
}

export interface StudentsRepository {
  listByClass(classId: string): Promise<StudentRosterRow[]>;
  createBulk(schoolId: number, classId: string, entries: PreparedStudent[]): Promise<BulkRepositoryResult>;
  findById(studentId: string): Promise<StudentRecord | null>;
  resetPassword(studentId: number, passwordHash: string): Promise<void>;
  delete(studentId: number): Promise<void>;
  getResults(studentId: number): Promise<StudentResults>;
}

interface IdRow extends RowDataPacket {
  id: number;
}

async function createBulkInTransaction(
  connection: PoolConnection,
  schoolId: number,
  classId: string,
  entries: PreparedStudent[],
): Promise<BulkRepositoryResult> {
  const created: CreatedStudent[] = [];
  const skipped: BulkRepositoryResult['skipped'] = [];
  for (const entry of entries) {
    const [existingRows] = await connection.query<IdRow[]>(
      'SELECT id FROM students WHERE school_id = ? AND student_number = ?',
      [schoolId, entry.studentNumber],
    );
    if (existingRows[0]) {
      skipped.push({
        index: entry.index,
        value: { ...entry.source, reason: 'nomor induk sudah dipakai di sekolah ini' },
      });
      continue;
    }

    const [result] = await connection.query<ResultSetHeader>(
      'INSERT INTO students (school_id, class_id, name, student_number, password_hash) VALUES (?, ?, ?, ?, ?)',
      [schoolId, classId, entry.name, entry.studentNumber, entry.passwordHash],
    );
    created.push({
      id: result.insertId,
      name: entry.name,
      student_number: entry.studentNumber,
      password: entry.plainPassword,
    });
  }
  return { created, skipped };
}

export function createStudentsRepository(pool: Pool): StudentsRepository {
  return {
    async listByClass(classId) {
      const [rows] = await pool.query<StudentRosterRow[]>(
        'SELECT id, name, student_number, created_at FROM students WHERE class_id = ? ORDER BY name',
        [classId],
      );
      return rows;
    },

    async createBulk(schoolId, classId, entries) {
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        const result = await createBulkInTransaction(connection, schoolId, classId, entries);
        await connection.commit();
        return result;
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    },

    async findById(studentId) {
      const [rows] = await pool.query<StudentRecord[]>('SELECT * FROM students WHERE id = ?', [studentId]);
      return rows[0] ?? null;
    },

    async resetPassword(studentId, passwordHash) {
      await pool.query(
        'UPDATE students SET password_hash = ?, auth_version = auth_version + 1 WHERE id = ?',
        [passwordHash, studentId],
      );
    },

    async delete(studentId) {
      await pool.query('DELETE FROM students WHERE id = ?', [studentId]);
    },

    async getResults(studentId) {
      const [sessions] = await pool.query<RowDataPacket[]>(`
        SELECT id, scene_name, started_at, ended_at, duration_seconds
        FROM sessions WHERE student_id = ? ORDER BY started_at DESC LIMIT 50
      `, [studentId]);
      const [quizRows] = await pool.query<RowDataPacket[]>(`
        SELECT COUNT(*) AS total_attempts,
          SUM(q.is_correct) AS total_correct,
          ROUND(100.0 * SUM(q.is_correct) / COUNT(*), 1) AS accuracy_pct
        FROM quiz_results q JOIN sessions s ON s.id = q.session_id
        WHERE s.student_id = ?
      `, [studentId]);
      const [perQuestion] = await pool.query<RowDataPacket[]>(`
        SELECT q.question_id, q.answer, q.is_correct, q.created_at
        FROM quiz_results q JOIN sessions s ON s.id = q.session_id
        WHERE s.student_id = ? ORDER BY q.created_at DESC LIMIT 50
      `, [studentId]);
      const [interactionRows] = await pool.query<RowDataPacket[]>(`
        SELECT COUNT(*) AS total_interactions
        FROM interactions i JOIN sessions s ON s.id = i.session_id
        WHERE s.student_id = ?
      `, [studentId]);
      return {
        sessions,
        quizTotals: quizRows[0] ?? {},
        perQuestion,
        interactionTotals: interactionRows[0] ?? {},
      };
    },
  };
}
