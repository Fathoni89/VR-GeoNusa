export type StaffRole = 'super_admin' | 'school_admin' | 'teacher';
export type StudentRole = 'student';
export type PrincipalRole = StaffRole | StudentRole;

export interface AccountPrincipal {
  account_id: number;
  username: string;
  role: StaffRole;
  school_id: number | null;
  must_change_password: boolean;
  auth_version: number;
}

export interface StudentPrincipal {
  student_id: number;
  student_number: string;
  name: string;
  role: StudentRole;
  school_id: number;
  class_id: number | null;
  auth_version: number;
}

export type AuthPrincipal = AccountPrincipal | StudentPrincipal;

export interface AppLogger {
  log(...parameters: unknown[]): void;
  error(...parameters: unknown[]): void;
}

export type EnvironmentSource = Record<string, string | undefined>;
