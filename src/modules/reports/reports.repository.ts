import fs from 'node:fs';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import type { ReportPagination } from './reports.schema';

export interface ReportScope {
  schoolId: number | null;
  classId: number | null;
  teacherAccountId: number | null;
}

interface TotalsRow extends RowDataPacket {
  total_sessions: number;
  total_students: number;
  avg_duration_seconds: number | null;
  total_quiz_attempts: number;
  quiz_accuracy_pct: number | null;
  total_interactions: number;
}

interface ReportRow extends RowDataPacket {
  [key: string]: unknown;
}

export interface ReportSummaryRows {
  totals: TotalsRow;
  perQuestion: ReportRow[];
  perObject: ReportRow[];
  perSchool: ReportRow[];
  perClass: ReportRow[];
  availableClasses: ReportRow[];
  recentSessions: ReportRow[];
}

export interface ReportsRepository {
  schoolExists(schoolId: number): Promise<boolean>;
  classExists(scope: ReportScope): Promise<boolean>;
  summary(
    scope: ReportScope,
    pagination: ReportPagination,
    includePerSchool: boolean,
  ): Promise<ReportSummaryRows>;
  exportRows(scope: ReportScope): Promise<ReportRow[]>;
  findQuestionConcept(questionId: string): string | null;
}

interface ReportsRepositoryOptions {
  quizFile: string;
}

function sessionFilter(scope: ReportScope): { sql: string; parameters: number[] } {
  const clauses = ['s.student_id IS NOT NULL'];
  const parameters: number[] = [];
  if (scope.schoolId !== null) {
    clauses.push('s.school_id = ?');
    parameters.push(scope.schoolId);
  }
  if (scope.teacherAccountId !== null) {
    clauses.push(`EXISTS (
      SELECT 1 FROM classes report_scope_class
      WHERE report_scope_class.id = s.class_id
        AND report_scope_class.teacher_account_id = ?
    )`);
    parameters.push(scope.teacherAccountId);
  }
  if (scope.classId !== null) {
    clauses.push('s.class_id = ?');
    parameters.push(scope.classId);
  }
  return { sql: `AND ${clauses.join(' AND ')}`, parameters };
}

function classFilter(
  scope: ReportScope,
  includeSelectedClass: boolean,
): { sql: string; parameters: number[] } {
  const clauses: string[] = [];
  const parameters: number[] = [];
  if (scope.schoolId !== null) {
    clauses.push('c.school_id = ?');
    parameters.push(scope.schoolId);
  }
  if (scope.teacherAccountId !== null) {
    clauses.push('c.teacher_account_id = ?');
    parameters.push(scope.teacherAccountId);
  }
  if (includeSelectedClass && scope.classId !== null) {
    clauses.push('c.id = ?');
    parameters.push(scope.classId);
  }
  return {
    sql: clauses.length ? `AND ${clauses.join(' AND ')}` : '',
    parameters,
  };
}

export function createReportsRepository(
  pool: Pool,
  options: ReportsRepositoryOptions,
): ReportsRepository {
  let questionConcepts: Record<string, string> | null = null;

  return {
    async schoolExists(schoolId) {
      const [rows] = await pool.query<RowDataPacket[]>(
        'SELECT id FROM schools WHERE id = ?',
        [schoolId],
      );
      return rows.length > 0;
    },

    async classExists(scope) {
      if (scope.classId === null) return false;
      let sql = 'SELECT id FROM classes WHERE id = ?';
      const parameters = [scope.classId];
      if (scope.schoolId !== null) {
        sql += ' AND school_id = ?';
        parameters.push(scope.schoolId);
      }
      if (scope.teacherAccountId !== null) {
        sql += ' AND teacher_account_id = ?';
        parameters.push(scope.teacherAccountId);
      }
      const [rows] = await pool.query<RowDataPacket[]>(sql, parameters);
      return rows.length > 0;
    },

    async summary(scope, pagination, includePerSchool) {
      const sessions = sessionFilter(scope);
      const availableClasses = classFilter(scope, false);
      const selectedClasses = classFilter(scope, true);
      const perSchoolPromise = includePerSchool
        ? pool.query<ReportRow[]>(`
            SELECT sc.id AS school_id, sc.name AS school_name, COUNT(*) AS session_count
            FROM sessions s LEFT JOIN schools sc ON sc.id = s.school_id
            WHERE 1=1 ${sessions.sql}
            GROUP BY sc.id, sc.name ORDER BY session_count DESC
          `, sessions.parameters)
        : Promise.resolve<[ReportRow[], unknown]>([[], []]);

      const [
        [totalRows],
        [perQuestion],
        [perObject],
        [perSchool],
        [classOptions],
        [perClass],
        [recentSessions],
      ] = await Promise.all([
        pool.query<TotalsRow[]>(`
          SELECT
            COUNT(*) AS total_sessions,
            COUNT(DISTINCT s.student_id) AS total_students,
            ROUND(AVG(s.duration_seconds)) AS avg_duration_seconds,
            COALESCE(SUM(COALESCE(q.attempts, 0)), 0) AS total_quiz_attempts,
            CASE WHEN COALESCE(SUM(q.attempts), 0) = 0 THEN NULL
              ELSE ROUND(100.0 * SUM(q.correct) / SUM(q.attempts), 1)
            END AS quiz_accuracy_pct,
            COALESCE(SUM(COALESCE(i.interaction_count, 0)), 0) AS total_interactions
          FROM sessions s
          LEFT JOIN (
            SELECT session_id, COUNT(*) AS attempts, SUM(is_correct) AS correct
            FROM quiz_results GROUP BY session_id
          ) q ON q.session_id = s.id
          LEFT JOIN (
            SELECT session_id, COUNT(*) AS interaction_count
            FROM interactions GROUP BY session_id
          ) i ON i.session_id = s.id
          WHERE 1=1 ${sessions.sql}
        `, sessions.parameters),
        pool.query<ReportRow[]>(`
          SELECT q.question_id,
            COUNT(*) AS attempts,
            SUM(q.is_correct) AS correct,
            ROUND(100.0 * SUM(q.is_correct) / COUNT(*), 1) AS accuracy_pct,
            ROUND(AVG(q.response_time), 1) AS avg_response_time
          FROM quiz_results q JOIN sessions s ON s.id = q.session_id
          WHERE 1=1 ${sessions.sql}
          GROUP BY q.question_id ORDER BY q.question_id
        `, sessions.parameters),
        pool.query<ReportRow[]>(`
          SELECT o.object_code, o.geometry_label, COUNT(*) AS interaction_count
          FROM interactions i
          JOIN objects o ON o.id = i.object_id
          JOIN sessions s ON s.id = i.session_id
          WHERE 1=1 ${sessions.sql}
          GROUP BY o.object_code, o.geometry_label ORDER BY interaction_count DESC
        `, sessions.parameters),
        perSchoolPromise,
        pool.query<ReportRow[]>(`
          SELECT id, class_name FROM classes c
          WHERE 1=1 ${availableClasses.sql}
          ORDER BY class_name
        `, availableClasses.parameters),
        pool.query<ReportRow[]>(`
          SELECT c.id AS class_id, c.class_name, COUNT(s.id) AS session_count
          FROM classes c
          LEFT JOIN sessions s ON s.class_id = c.id AND s.student_id IS NOT NULL
          WHERE 1=1 ${selectedClasses.sql}
          GROUP BY c.id, c.class_name ORDER BY session_count DESC
        `, selectedClasses.parameters),
        pool.query<ReportRow[]>(`
          SELECT s.id, u.name AS student_name, sc.name AS school_name,
            cl.class_name, s.scene_name, s.started_at, s.duration_seconds
          FROM sessions s
          JOIN users u ON u.id = s.user_id
          LEFT JOIN schools sc ON sc.id = s.school_id
          LEFT JOIN classes cl ON cl.id = s.class_id
          WHERE 1=1 ${sessions.sql}
          ORDER BY s.started_at DESC LIMIT ? OFFSET ?
        `, [...sessions.parameters, pagination.pageSize, pagination.offset]),
      ]);

      const totals = totalRows[0] ?? {
        total_sessions: 0,
        total_students: 0,
        avg_duration_seconds: null,
        total_quiz_attempts: 0,
        quiz_accuracy_pct: null,
        total_interactions: 0,
      } as TotalsRow;
      return {
        totals,
        perQuestion,
        perObject,
        perSchool,
        perClass,
        availableClasses: classOptions,
        recentSessions,
      };
    },

    async exportRows(scope) {
      const sessions = sessionFilter(scope);
      const [rows] = await pool.query<ReportRow[]>(`
        SELECT s.id, u.name AS student_name, sc.name AS school_name, cl.class_name,
          s.scene_name, s.started_at, s.ended_at, s.duration_seconds, s.device_type
        FROM sessions s
        JOIN users u ON u.id = s.user_id
        LEFT JOIN schools sc ON sc.id = s.school_id
        LEFT JOIN classes cl ON cl.id = s.class_id
        WHERE 1=1 ${sessions.sql}
        ORDER BY s.started_at DESC
      `, sessions.parameters);
      return rows;
    },

    findQuestionConcept(questionId) {
      if (!questionConcepts) {
        questionConcepts = {};
        try {
          const quiz = JSON.parse(fs.readFileSync(options.quizFile, 'utf8')) as {
            questions?: Array<{ id?: unknown; class_id?: unknown }>;
          };
          for (const question of quiz.questions ?? []) {
            if (typeof question.id === 'string' && typeof question.class_id === 'string') {
              questionConcepts[question.id] = question.class_id;
            }
          }
        } catch {
          questionConcepts = {};
        }
      }
      return questionConcepts[questionId] ?? null;
    },
  };
}
