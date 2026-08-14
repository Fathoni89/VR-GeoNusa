export type StaffRole = 'super_admin' | 'school_admin' | 'teacher';

export interface AccountPrincipal {
  account_id: number;
  username: string;
  role: StaffRole;
  school_id: number | null;
  must_change_password: boolean;
}

export interface StudentPrincipal {
  student_id: number;
  student_number: string;
  name: string;
  school_id: number;
  class_id: number | null;
}

export interface AppLogger {
  log(...parameters: unknown[]): void;
  error(...parameters: unknown[]): void;
}

export type EnvironmentSource = Record<string, string | undefined>;
