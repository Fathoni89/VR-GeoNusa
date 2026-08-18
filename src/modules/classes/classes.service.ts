import type { AccountPrincipal } from '../../shared/types';
import { createClassSchema } from './classes.schema';
import type { ClassListRow, ClassRecord, ClassesRepository } from './classes.repository';

interface ServiceError {
  ok: false;
  status: number;
  message: string;
}

interface ServiceSuccess<T> {
  ok: true;
  value: T;
}

export type ClassesServiceResult<T> = ServiceSuccess<T> | ServiceError;

export interface CreatedClass {
  id: number;
  class_name: string;
}

export interface ClassesService {
  list(principal: AccountPrincipal, schoolId?: unknown): Promise<ClassListRow[]>;
  create(principal: AccountPrincipal, body: unknown): Promise<ClassesServiceResult<CreatedClass>>;
  delete(principal: AccountPrincipal, classId: string): Promise<ClassesServiceResult<null>>;
  getAccessibleClass(
    principal: AccountPrincipal,
    classId: string,
  ): Promise<ClassesServiceResult<ClassRecord>>;
}

export function createClassesService(repository: ClassesRepository): ClassesService {
  const getAccessibleClass: ClassesService['getAccessibleClass'] = async (principal, classId) => {
    const classroom = await repository.findById(classId);
    if (!classroom) return { ok: false, status: 404, message: 'Kelas tidak ditemukan' };
    const allowed = principal.role === 'super_admin'
      || (principal.role === 'school_admin' && classroom.school_id === principal.school_id)
      || (principal.role === 'teacher' && classroom.teacher_account_id === principal.account_id);
    if (!allowed) return { ok: false, status: 403, message: 'Bukan kelas Anda' };
    return { ok: true, value: classroom };
  };

  return {
    async list(principal, schoolId) {
      if (principal.role === 'super_admin') return repository.listAll(schoolId);
      if (principal.role === 'school_admin') return repository.listBySchool(principal.school_id);
      return repository.listByTeacher(principal.account_id);
    },

    async create(principal, body) {
      if (principal.role === 'super_admin') {
        return {
          ok: false,
          status: 400,
          message: 'super_admin tidak mengajar kelas — buat lewat akun guru',
        };
      }

      const raw = body as Record<string, unknown> | null | undefined;
      if (!raw?.class_name) {
        return { ok: false, status: 400, message: 'class_name wajib diisi' };
      }
      const parsed = createClassSchema.safeParse(body);
      if (!parsed.success) {
        return { ok: false, status: 400, message: 'Field kelas melebihi panjang maksimum' };
      }

      let teacherAccountId = principal.account_id;
      if (principal.role === 'school_admin') {
        const requestedTeacherId = parsed.data.teacher_account_id;
        if (!requestedTeacherId) {
          return { ok: false, status: 400, message: 'teacher_account_id wajib dipilih' };
        }
        const teacher = await repository.findTeacherInSchool(
          requestedTeacherId,
          principal.school_id,
        );
        if (!teacher) {
          return { ok: false, status: 400, message: 'Guru tidak ditemukan di sekolah ini' };
        }
        teacherAccountId = teacher.id;
      }

      const id = await repository.create({
        schoolId: principal.school_id,
        teacherAccountId,
        className: parsed.data.class_name,
        gradeLevel: parsed.data.grade_level || null,
        academicYear: parsed.data.academic_year || null,
      });
      return { ok: true, value: { id, class_name: parsed.data.class_name } };
    },

    async delete(principal, classId) {
      const access = await getAccessibleClass(principal, classId);
      if (!access.ok) return access;
      await repository.delete(classId);
      return { ok: true, value: null };
    },

    getAccessibleClass,
  };
}
