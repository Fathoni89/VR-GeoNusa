import type { AccountPrincipal, StaffRole } from '../../shared/types';
import { createAccountSchema, resetAccountPasswordSchema } from './accounts.schema';
import type {
  AccountListRow,
  AccountsRepository,
} from './accounts.repository';

interface ServiceError {
  ok: false;
  status: number;
  message: string;
}

interface ServiceSuccess<T> {
  ok: true;
  value: T;
}

export type AccountsServiceResult<T> = ServiceSuccess<T> | ServiceError;

export interface PasswordHasher {
  hash(password: string, cost: number): Promise<string>;
}

export interface CreatedAccount {
  id: number;
  username: string;
  role: StaffRole;
  school_id: unknown;
}

export interface AccountsService {
  list(principal: AccountPrincipal): Promise<AccountsServiceResult<AccountListRow[]>>;
  create(principal: AccountPrincipal, body: unknown): Promise<AccountsServiceResult<CreatedAccount>>;
  resetPassword(
    principal: AccountPrincipal,
    accountId: string,
    body: unknown,
  ): Promise<AccountsServiceResult<null>>;
  delete(principal: AccountPrincipal, accountId: string): Promise<AccountsServiceResult<null>>;
}

const forbidden = (): ServiceError => ({
  ok: false,
  status: 403,
  message: 'Tidak punya akses untuk aksi ini',
});

function canManageAccount(principal: AccountPrincipal, target: {
  role: StaffRole;
  school_id: number | null;
}): boolean {
  return principal.role === 'super_admin'
    || (target.role === 'teacher' && target.school_id === principal.school_id);
}

export function createAccountsService(
  repository: AccountsRepository,
  passwords: PasswordHasher,
): AccountsService {
  return {
    async list(principal) {
      if (principal.role === 'teacher') return forbidden();
      const rows = principal.role === 'super_admin'
        ? await repository.listAll()
        : await repository.listBySchool(principal.school_id);
      return { ok: true, value: rows };
    },

    async create(principal, body) {
      if (principal.role === 'teacher') return forbidden();
      const parsed = createAccountSchema.safeParse(body);
      if (!parsed.success) {
        return { ok: false, status: 400, message: 'username dan password wajib diisi' };
      }
      if (parsed.data.password.length < 6) {
        return { ok: false, status: 400, message: 'Password minimal 6 karakter' };
      }

      let schoolId = parsed.data.school_id;
      let role: StaffRole;
      if (principal.role === 'super_admin') {
        role = parsed.data.role === 'super_admin'
          || parsed.data.role === 'school_admin'
          || parsed.data.role === 'teacher'
          ? parsed.data.role
          : 'teacher';
        if (role !== 'super_admin' && !schoolId) {
          return {
            ok: false,
            status: 400,
            message: 'school_id wajib untuk akun school_admin/guru',
          };
        }
      } else {
        role = 'teacher';
        schoolId = principal.school_id;
      }

      const existing = await repository.findByUsername(parsed.data.username);
      if (existing) {
        return {
          ok: false,
          status: 409,
          message: `Username "${parsed.data.username}" sudah dipakai`,
        };
      }

      const hash = await passwords.hash(parsed.data.password, 10);
      const id = await repository.create(
        parsed.data.username,
        hash,
        role,
        role === 'super_admin' ? null : schoolId,
      );
      return {
        ok: true,
        value: {
          id,
          username: parsed.data.username,
          role,
          school_id: schoolId || null,
        },
      };
    },

    async resetPassword(principal, accountId, body) {
      if (principal.role === 'teacher') return forbidden();
      const target = await repository.findById(accountId);
      if (!target) return { ok: false, status: 404, message: 'Akun tidak ditemukan' };
      if (!canManageAccount(principal, target)) {
        return { ok: false, status: 403, message: 'Tidak punya akses untuk akun ini' };
      }

      const parsed = resetAccountPasswordSchema.safeParse(body);
      if (!parsed.success) {
        return { ok: false, status: 400, message: 'Password minimal 6 karakter' };
      }
      const hash = await passwords.hash(parsed.data.new_password, 10);
      await repository.resetPassword(accountId, hash);
      return { ok: true, value: null };
    },

    async delete(principal, accountId) {
      if (principal.role === 'teacher') return forbidden();
      if (Number(accountId) === principal.account_id) {
        return { ok: false, status: 400, message: 'Tidak bisa menghapus akun sendiri' };
      }

      const target = await repository.findById(accountId);
      if (!target) return { ok: false, status: 404, message: 'Akun tidak ditemukan' };
      if (!canManageAccount(principal, target)) {
        return { ok: false, status: 403, message: 'Tidak punya akses untuk akun ini' };
      }
      await repository.delete(accountId);
      return { ok: true, value: null };
    },
  };
}
