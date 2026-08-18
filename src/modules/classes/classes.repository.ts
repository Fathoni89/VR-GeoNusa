import type { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';

export interface ClassRecord extends RowDataPacket {
  id: number;
  school_id: number;
  teacher_account_id: number;
  class_name: string;
  grade_level: string | null;
  academic_year: string | null;
  created_at: unknown;
}

export interface ClassListRow extends ClassRecord {
  school_name: string;
  teacher_username: string;
  student_count: number;
}

interface TeacherRow extends RowDataPacket {
  id: number;
}

export interface ClassesRepository {
  listAll(schoolId?: unknown): Promise<ClassListRow[]>;
  listBySchool(schoolId: number | null): Promise<ClassListRow[]>;
  listByTeacher(accountId: number): Promise<ClassListRow[]>;
  findById(classId: string): Promise<ClassRecord | null>;
  findTeacherInSchool(teacherId: unknown, schoolId: number | null): Promise<TeacherRow | null>;
  create(input: {
    schoolId: number | null;
    teacherAccountId: number;
    className: string;
    gradeLevel: string | null;
    academicYear: string | null;
  }): Promise<number>;
  delete(classId: string): Promise<void>;
}

const listSql = `
  SELECT c.*, s.name AS school_name, a.username AS teacher_username,
    (SELECT COUNT(*) FROM students st WHERE st.class_id = c.id) AS student_count
  FROM classes c
  JOIN schools s ON s.id = c.school_id
  JOIN accounts a ON a.id = c.teacher_account_id
  WHERE 1=1`;

export function createClassesRepository(pool: Pool): ClassesRepository {
  return {
    async listAll(schoolId) {
      const filter = schoolId ? ' AND c.school_id = ?' : '';
      const parameters = schoolId ? [schoolId] : [];
      const [rows] = await pool.query<ClassListRow[]>(
        `${listSql}${filter} ORDER BY c.created_at DESC`,
        parameters,
      );
      return rows;
    },

    async listBySchool(schoolId) {
      const [rows] = await pool.query<ClassListRow[]>(
        `${listSql} AND c.school_id = ? ORDER BY c.created_at DESC`,
        [schoolId],
      );
      return rows;
    },

    async listByTeacher(accountId) {
      const [rows] = await pool.query<ClassListRow[]>(
        `${listSql} AND c.teacher_account_id = ? ORDER BY c.created_at DESC`,
        [accountId],
      );
      return rows;
    },

    async findById(classId) {
      const [rows] = await pool.query<ClassRecord[]>('SELECT * FROM classes WHERE id = ?', [classId]);
      return rows[0] ?? null;
    },

    async findTeacherInSchool(teacherId, schoolId) {
      const [rows] = await pool.query<TeacherRow[]>(
        "SELECT id FROM accounts WHERE id = ? AND role = 'teacher' AND school_id = ?",
        [teacherId, schoolId],
      );
      return rows[0] ?? null;
    },

    async create(input) {
      const [result] = await pool.query<ResultSetHeader>(
        'INSERT INTO classes (school_id, teacher_account_id, class_name, grade_level, academic_year) VALUES (?, ?, ?, ?, ?)',
        [
          input.schoolId,
          input.teacherAccountId,
          input.className,
          input.gradeLevel,
          input.academicYear,
        ],
      );
      return result.insertId;
    },

    async delete(classId) {
      await pool.query('DELETE FROM classes WHERE id = ?', [classId]);
    },
  };
}
