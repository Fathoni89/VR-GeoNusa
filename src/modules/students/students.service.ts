import type { AccountPrincipal, StudentPrincipal } from '../../shared/types';
import type { ClassesService } from '../classes/classes.service';
import {
  bulkStudentItemSchema,
  bulkStudentsSchema,
  MAX_BULK_STUDENTS,
  MAX_STUDENT_NAME_LENGTH,
  MAX_STUDENT_NUMBER_LENGTH,
} from './students.schema';
import type {
  CreatedStudent,
  PreparedStudent,
  SkippedStudent,
  StudentRosterRow,
  StudentsRepository,
} from './students.repository';

interface ServiceError {
  ok: false;
  status: number;
  message: string;
}

interface ServiceSuccess<T> {
  ok: true;
  value: T;
}

export type StudentsServiceResult<T> = ServiceSuccess<T> | ServiceError;

export interface PasswordHasher {
  hash(password: string, cost: number): Promise<string>;
}

export interface StudentPasswordGenerator {
  generate(): string;
}

export interface BulkStudentsResult {
  created: CreatedStudent[];
  skipped: SkippedStudent[];
}

export interface OwnStudentResults {
  name: string;
  totals: {
    total_sessions: number;
    total_quiz_attempts: unknown;
    quiz_accuracy_pct: unknown;
    total_interactions: unknown;
  };
  sessions: Awaited<ReturnType<StudentsRepository['getResults']>>['sessions'];
  perQuestion: Awaited<ReturnType<StudentsRepository['getResults']>>['perQuestion'];
}

export interface StudentsService {
  listRoster(
    principal: AccountPrincipal,
    classId: string,
  ): Promise<StudentsServiceResult<StudentRosterRow[]>>;
  createBulk(
    principal: AccountPrincipal,
    classId: string,
    body: unknown,
  ): Promise<StudentsServiceResult<BulkStudentsResult>>;
  resetPassword(
    principal: AccountPrincipal,
    studentId: string,
  ): Promise<StudentsServiceResult<string>>;
  delete(principal: AccountPrincipal, studentId: string): Promise<StudentsServiceResult<null>>;
  getOwnResults(principal: StudentPrincipal): Promise<OwnStudentResults>;
}

function skippedValue(source: Record<string, unknown>, reason: string): SkippedStudent {
  return { ...source, reason };
}

export function createStudentsService(
  repository: StudentsRepository,
  classesService: ClassesService,
  passwords: PasswordHasher,
  passwordGenerator: StudentPasswordGenerator,
): StudentsService {
  return {
    async listRoster(principal, classId) {
      const access = await classesService.getAccessibleClass(principal, classId);
      if (!access.ok) return access;
      return { ok: true, value: await repository.listByClass(classId) };
    },

    async createBulk(principal, classId, body) {
      const access = await classesService.getAccessibleClass(principal, classId);
      if (!access.ok) return access;

      const raw = body as Record<string, unknown> | null | undefined;
      if (!Array.isArray(raw?.students) || raw.students.length === 0) {
        return {
          ok: false,
          status: 400,
          message: 'Kirim array "students" (minimal 1)',
        };
      }
      if (raw.students.length > MAX_BULK_STUDENTS) {
        return { ok: false, status: 400, message: 'Maksimal 100 siswa per request' };
      }
      const parsed = bulkStudentsSchema.safeParse(body);
      if (!parsed.success) {
        return {
          ok: false,
          status: 400,
          message: 'Kirim array "students" (minimal 1)',
        };
      }

      const prepared: PreparedStudent[] = [];
      const skipped: Array<{ index: number; value: SkippedStudent }> = [];
      for (const [index, candidate] of parsed.data.students.entries()) {
        const item = bulkStudentItemSchema.safeParse(candidate);
        const source = typeof candidate === 'object' && candidate !== null
          ? candidate as Record<string, unknown>
          : {};
        if (!item.success) {
          skipped.push({ index, value: skippedValue(source, 'nama/nomor induk kosong') });
          continue;
        }
        const name = item.data.name.trim();
        const studentNumber = item.data.student_number.trim();
        if (!name || !studentNumber) {
          skipped.push({ index, value: skippedValue(source, 'nama/nomor induk kosong') });
          continue;
        }
        if (name.length > MAX_STUDENT_NAME_LENGTH) {
          skipped.push({
            index,
            value: skippedValue(source, 'nama terlalu panjang (maksimal 100 karakter)'),
          });
          continue;
        }
        if (studentNumber.length > MAX_STUDENT_NUMBER_LENGTH) {
          skipped.push({
            index,
            value: skippedValue(source, 'nomor induk terlalu panjang (maksimal 50 karakter)'),
          });
          continue;
        }

        const plainPassword = passwordGenerator.generate();
        prepared.push({
          index,
          source,
          name,
          studentNumber,
          plainPassword,
          passwordHash: await passwords.hash(plainPassword, 10),
        });
      }

      const inserted = await repository.createBulk(
        access.value.school_id,
        classId,
        prepared,
      );
      const allSkipped = [...skipped, ...inserted.skipped]
        .sort((left, right) => left.index - right.index)
        .map(item => item.value);
      return { ok: true, value: { created: inserted.created, skipped: allSkipped } };
    },

    async resetPassword(principal, studentId) {
      const student = await repository.findById(studentId);
      if (!student) return { ok: false, status: 404, message: 'Siswa tidak ditemukan' };
      const access = await classesService.getAccessibleClass(principal, String(student.class_id));
      if (!access.ok) return access;
      const plainPassword = passwordGenerator.generate();
      const hash = await passwords.hash(plainPassword, 10);
      await repository.resetPassword(student.id, hash);
      return { ok: true, value: plainPassword };
    },

    async delete(principal, studentId) {
      const student = await repository.findById(studentId);
      if (!student) return { ok: false, status: 404, message: 'Siswa tidak ditemukan' };
      const access = await classesService.getAccessibleClass(principal, String(student.class_id));
      if (!access.ok) return access;
      await repository.delete(student.id);
      return { ok: true, value: null };
    },

    async getOwnResults(principal) {
      const result = await repository.getResults(principal.student_id);
      return {
        name: principal.name,
        totals: {
          total_sessions: result.sessions.length,
          total_quiz_attempts: result.quizTotals.total_attempts || 0,
          quiz_accuracy_pct: result.quizTotals.accuracy_pct || 0,
          total_interactions: result.interactionTotals.total_interactions || 0,
        },
        sessions: result.sessions,
        perQuestion: result.perQuestion,
      };
    },
  };
}
