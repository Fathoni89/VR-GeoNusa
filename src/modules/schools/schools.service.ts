import type { AccountPrincipal } from '../../shared/types';
import { createSchoolSchema } from './schools.schema';
import type { SchoolRow, SchoolsRepository } from './schools.repository';

interface ServiceError {
  ok: false;
  status: number;
  message: string;
}

interface ServiceSuccess<T> {
  ok: true;
  value: T;
}

export type SchoolsServiceResult<T> = ServiceSuccess<T> | ServiceError;

export interface CreatedSchool {
  id: number;
  name: string;
  code?: string | null;
}

export interface SchoolsService {
  list(): Promise<SchoolRow[]>;
  create(principal: AccountPrincipal, body: unknown): Promise<SchoolsServiceResult<CreatedSchool>>;
  delete(principal: AccountPrincipal, schoolId: string): Promise<SchoolsServiceResult<null>>;
}

const forbidden = (): ServiceError => ({
  ok: false,
  status: 403,
  message: 'Tidak punya akses untuk aksi ini',
});

export function createSchoolsService(repository: SchoolsRepository): SchoolsService {
  return {
    list: () => repository.list(),

    async create(principal, body) {
      if (principal.role !== 'super_admin') return forbidden();
      const parsed = createSchoolSchema.safeParse(body);
      if (!parsed.success) {
        return { ok: false, status: 400, message: 'name wajib diisi' };
      }

      const { name, code } = parsed.data;
      const id = await repository.create(name, code || null);
      return { ok: true, value: { id, name, code } };
    },

    async delete(principal, schoolId) {
      if (principal.role !== 'super_admin') return forbidden();
      await repository.delete(schoolId);
      return { ok: true, value: null };
    },
  };
}
