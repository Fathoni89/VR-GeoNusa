import type { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type { StaffAccountRecord } from '../auth/auth.repository';
import type { StaffRole } from '../../shared/types';

export interface AccountListRow extends RowDataPacket {
  id: number;
  username: string;
  role: StaffRole;
  school_id: number | null;
  school_name: string | null;
  created_at: unknown;
}

export interface AccountsRepository {
  listAll(): Promise<AccountListRow[]>;
  listBySchool(schoolId: number | null): Promise<AccountListRow[]>;
  findByUsername(username: string): Promise<StaffAccountRecord | null>;
  findById(accountId: string): Promise<StaffAccountRecord | null>;
  create(
    username: string,
    passwordHash: string,
    role: StaffRole,
    schoolId: unknown,
  ): Promise<number>;
  resetPassword(accountId: string, passwordHash: string): Promise<void>;
  delete(accountId: string): Promise<void>;
}

interface StaffAccountRow extends RowDataPacket, StaffAccountRecord {}

const listSql = `
  SELECT a.id, a.username, a.role, a.school_id, s.name AS school_name, a.created_at
  FROM accounts a LEFT JOIN schools s ON s.id = a.school_id
  WHERE 1=1`;

export function createAccountsRepository(pool: Pool): AccountsRepository {
  return {
    async listAll() {
      const [rows] = await pool.query<AccountListRow[]>(`${listSql} ORDER BY a.created_at DESC`);
      return rows;
    },

    async listBySchool(schoolId) {
      const [rows] = await pool.query<AccountListRow[]>(
        `${listSql} AND a.school_id = ? ORDER BY a.created_at DESC`,
        [schoolId],
      );
      return rows;
    },

    async findByUsername(username) {
      const [rows] = await pool.query<StaffAccountRow[]>(
        'SELECT * FROM accounts WHERE username = ?',
        [username],
      );
      return rows[0] ?? null;
    },

    async findById(accountId) {
      const [rows] = await pool.query<StaffAccountRow[]>(
        'SELECT * FROM accounts WHERE id = ?',
        [accountId],
      );
      return rows[0] ?? null;
    },

    async create(username, passwordHash, role, schoolId) {
      const [result] = await pool.query<ResultSetHeader>(
        'INSERT INTO accounts (username, password_hash, role, school_id) VALUES (?, ?, ?, ?)',
        [username, passwordHash, role, schoolId],
      );
      return result.insertId;
    },

    async resetPassword(accountId, passwordHash) {
      await pool.query(
        'UPDATE accounts SET password_hash = ?, auth_version = auth_version + 1 WHERE id = ?',
        [passwordHash, accountId],
      );
    },

    async delete(accountId) {
      await pool.query('DELETE FROM accounts WHERE id = ?', [accountId]);
    },
  };
}
