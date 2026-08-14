import type { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type { StaffRole } from '../../shared/types';

export interface StaffAccountRecord {
  id: number;
  username: string;
  password_hash: string;
  role: StaffRole;
  school_id: number | null;
  must_change_password: boolean | number;
  auth_version: number;
}

export interface StudentAccountRecord {
  id: number;
  name: string;
  student_number: string;
  password_hash: string;
  school_id: number;
  class_id: number | null;
  auth_version: number;
}

export interface AuthRepository {
  findStaffByUsername(username: string): Promise<StaffAccountRecord | null>;
  findStaffById(accountId: number): Promise<StaffAccountRecord | null>;
  findStudentByCredentials(
    schoolId: string | number,
    studentNumber: string,
  ): Promise<StudentAccountRecord | null>;
  findStudentById(studentId: number): Promise<StudentAccountRecord | null>;
  updateStaffPasswordAndIncrementVersion(
    accountId: number,
    expectedAuthVersion: number,
    passwordHash: string,
  ): Promise<boolean>;
}

interface StaffAccountRow extends RowDataPacket, StaffAccountRecord {}
interface StudentAccountRow extends RowDataPacket, StudentAccountRecord {}

export function createAuthRepository(pool: Pool): AuthRepository {
  return {
    async findStaffByUsername(username) {
      const [rows] = await pool.query<StaffAccountRow[]>(
        'SELECT * FROM accounts WHERE username = ?',
        [username],
      );
      return rows[0] ?? null;
    },

    async findStaffById(accountId) {
      const [rows] = await pool.query<StaffAccountRow[]>(
        'SELECT * FROM accounts WHERE id = ?',
        [accountId],
      );
      return rows[0] ?? null;
    },

    async findStudentByCredentials(schoolId, studentNumber) {
      const [rows] = await pool.query<StudentAccountRow[]>(
        'SELECT * FROM students WHERE school_id = ? AND student_number = ?',
        [schoolId, studentNumber],
      );
      return rows[0] ?? null;
    },

    async findStudentById(studentId) {
      const [rows] = await pool.query<StudentAccountRow[]>(
        'SELECT * FROM students WHERE id = ?',
        [studentId],
      );
      return rows[0] ?? null;
    },

    async updateStaffPasswordAndIncrementVersion(accountId, expectedAuthVersion, passwordHash) {
      const [result] = await pool.query<ResultSetHeader>(
        `UPDATE accounts
         SET password_hash = ?, must_change_password = 0, auth_version = auth_version + 1
         WHERE id = ? AND auth_version = ?`,
        [passwordHash, accountId, expectedAuthVersion],
      );
      return result.affectedRows === 1;
    },
  };
}
