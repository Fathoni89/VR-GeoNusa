import type { AccountPrincipal, StaffRole, StudentPrincipal } from '../../shared/types';
import {
  authTokenClaimsSchema,
  type ChangePasswordInput,
  type StaffLoginInput,
  type StaffTokenClaims,
  type StudentLoginInput,
  type StudentTokenClaims,
} from './auth.schema';
import type {
  AuthRepository,
  StaffAccountRecord,
  StudentAccountRecord,
} from './auth.repository';

const DUMMY_PASSWORD_HASH = '$2b$10$LtW2dhfahIWIOB8ja/yYuOjCSdZvrW/z1bA4iVekFrzyWZeykKD9C';

export interface PasswordCodec {
  compare(candidate: string, passwordHash: string): Promise<boolean>;
  hash(password: string, cost: number): Promise<string>;
}

export interface AuthTokenCodec {
  sign(
    claims: StaffTokenClaims | StudentTokenClaims,
    expiresIn: '24h' | '12h',
  ): string;
  verify(token: string): unknown;
}

export interface StaffLoginSuccess {
  token: string;
  username: string;
  role: StaffRole;
  school_id: number | null;
  must_change_password: boolean;
}

export interface StudentLoginSuccess {
  token: string;
  name: string;
  class_id: number | null;
  school_id: number;
}

export type VerifiedAuthPrincipal =
  | ({ kind: 'staff' } & AccountPrincipal)
  | ({ kind: 'student' } & StudentPrincipal);

export type ChangePasswordResult = 'changed' | 'unauthorized' | 'wrong_password';

export interface AuthService {
  loginStaff(input: StaffLoginInput): Promise<StaffLoginSuccess | null>;
  loginStudent(input: StudentLoginInput): Promise<StudentLoginSuccess | null>;
  verifyToken(token: string): Promise<VerifiedAuthPrincipal | null>;
  changePassword(token: string, input: ChangePasswordInput): Promise<ChangePasswordResult>;
}

export interface AuthServiceDependencies {
  repository: AuthRepository;
  passwords: PasswordCodec;
  tokens: AuthTokenCodec;
}

interface ResolvedStaffToken {
  kind: 'staff';
  account: StaffAccountRecord;
  authVersion: number;
}

interface ResolvedStudentToken {
  kind: 'student';
  student: StudentAccountRecord;
  authVersion: number;
}

type ResolvedToken = ResolvedStaffToken | ResolvedStudentToken;

function requireAuthVersion(value: unknown, subject: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${subject} memiliki auth_version yang tidak valid`);
  }
  return value;
}

function isStaffRole(value: unknown): value is StaffRole {
  return value === 'super_admin' || value === 'school_admin' || value === 'teacher';
}

function staffPrincipal(account: StaffAccountRecord): AccountPrincipal {
  if (!isStaffRole(account.role)) {
    throw new Error('Akun staf memiliki role yang tidak valid');
  }
  return {
    account_id: account.id,
    username: account.username,
    role: account.role,
    school_id: account.school_id,
    must_change_password: Number(account.must_change_password) === 1,
    auth_version: requireAuthVersion(account.auth_version, 'Akun'),
  };
}

function studentPrincipal(student: StudentAccountRecord): StudentPrincipal {
  return {
    student_id: student.id,
    student_number: student.student_number,
    name: student.name,
    role: 'student',
    school_id: student.school_id,
    class_id: student.class_id,
    auth_version: requireAuthVersion(student.auth_version, 'Siswa'),
  };
}

export function createAuthService(dependencies: AuthServiceDependencies): AuthService {
  const { repository, passwords, tokens } = dependencies;

  async function resolveToken(token: string): Promise<ResolvedToken | null> {
    let decoded: unknown;
    try {
      decoded = tokens.verify(token);
    } catch {
      return null;
    }
    const parsed = authTokenClaimsSchema.safeParse(decoded);
    if (!parsed.success) return null;

    const claims = parsed.data;
    if (claims.role === 'student') {
      const student = await repository.findStudentById(claims.student_id);
      if (!student) return null;
      const authVersion = requireAuthVersion(student.auth_version, 'Siswa');
      if (authVersion !== claims.auth_version) return null;
      return { kind: 'student', student, authVersion };
    }

    const account = await repository.findStaffById(claims.account_id);
    if (!account) return null;
    const authVersion = requireAuthVersion(account.auth_version, 'Akun');
    if (authVersion !== claims.auth_version) return null;
    return { kind: 'staff', account, authVersion };
  }

  return {
    async loginStaff(input) {
      const account = await repository.findStaffByUsername(input.username);
      const passwordMatches = await passwords.compare(
        input.password,
        account?.password_hash ?? DUMMY_PASSWORD_HASH,
      );
      if (!account || !passwordMatches) return null;

      const principal = staffPrincipal(account);
      const token = tokens.sign({
        ...principal,
      }, '24h');

      return {
        token,
        username: principal.username,
        role: principal.role,
        school_id: principal.school_id,
        must_change_password: principal.must_change_password,
      };
    },

    async loginStudent(input) {
      const student = await repository.findStudentByCredentials(
        input.school_id,
        input.student_number,
      );
      const passwordMatches = await passwords.compare(
        input.password,
        student?.password_hash ?? DUMMY_PASSWORD_HASH,
      );
      if (!student || !passwordMatches) return null;

      const principal = studentPrincipal(student);
      const token = tokens.sign({
        student_id: principal.student_id,
        name: principal.name,
        role: principal.role,
        school_id: principal.school_id,
        class_id: principal.class_id,
        auth_version: principal.auth_version,
      }, '12h');

      return {
        token,
        name: principal.name,
        class_id: principal.class_id,
        school_id: principal.school_id,
      };
    },

    async verifyToken(token) {
      const resolved = await resolveToken(token);
      if (!resolved) return null;

      if (resolved.kind === 'student') {
        return {
          kind: 'student',
          ...studentPrincipal(resolved.student),
        };
      }

      return {
        kind: 'staff',
        ...staffPrincipal(resolved.account),
      };
    },

    async changePassword(token, input) {
      const resolved = await resolveToken(token);
      if (!resolved || resolved.kind !== 'staff') return 'unauthorized';

      const passwordMatches = await passwords.compare(
        input.old_password,
        resolved.account.password_hash,
      );
      if (!passwordMatches) return 'wrong_password';

      const passwordHash = await passwords.hash(input.new_password, 10);
      const changed = await repository.updateStaffPasswordAndIncrementVersion(
        resolved.account.id,
        resolved.authVersion,
        passwordHash,
      );
      return changed ? 'changed' : 'unauthorized';
    },
  };
}
