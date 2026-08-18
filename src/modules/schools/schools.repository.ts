import type { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';

export interface SchoolRow extends RowDataPacket {
  id: number;
  name: string;
}

export interface SchoolsRepository {
  list(): Promise<SchoolRow[]>;
  create(name: string, code: string | null): Promise<number>;
  delete(schoolId: string): Promise<void>;
}

export function createSchoolsRepository(pool: Pool): SchoolsRepository {
  return {
    async list() {
      const [rows] = await pool.query<SchoolRow[]>('SELECT id, name FROM schools ORDER BY name');
      return rows;
    },

    async create(name, code) {
      const [result] = await pool.query<ResultSetHeader>(
        'INSERT INTO schools (name, code) VALUES (?, ?)',
        [name, code],
      );
      return result.insertId;
    },

    async delete(schoolId) {
      await pool.query('DELETE FROM schools WHERE id = ?', [schoolId]);
    },
  };
}
