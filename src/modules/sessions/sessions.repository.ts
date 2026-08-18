import type {
  Pool,
  PoolConnection,
  ResultSetHeader,
  RowDataPacket,
} from 'mysql2/promise';

export interface SessionOwnershipRecord extends RowDataPacket {
  id: number;
  student_id: number | null;
  write_token_hash: string | null;
}

interface StartedSessionRow extends RowDataPacket {
  started_at: unknown;
}

export interface CreateSessionRecord {
  name: string;
  role: unknown;
  schoolId: unknown;
  studentId: number | null;
  classId: number | null;
  sceneName: unknown;
  deviceType: unknown;
  writeTokenHash: string | null;
}

export interface SessionsRepository {
  create(record: CreateSessionRecord): Promise<number>;
  findOwnership(sessionId: unknown): Promise<SessionOwnershipRecord | null>;
  findStartedSession(sessionId: string): Promise<StartedSessionRow | null>;
  end(sessionId: string): Promise<void>;
}

async function insertUserAndSession(
  connection: PoolConnection,
  record: CreateSessionRecord,
): Promise<number> {
  const [userResult] = await connection.query<ResultSetHeader>(
    'INSERT INTO users (name, role, school_id) VALUES (?, ?, ?)',
    [record.name, record.role, record.schoolId],
  );
  const [sessionResult] = await connection.query<ResultSetHeader>(
    `INSERT INTO sessions
     (user_id, student_id, school_id, class_id, scene_name, device_type, write_token_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      userResult.insertId,
      record.studentId,
      record.schoolId,
      record.classId,
      record.sceneName,
      record.deviceType,
      record.writeTokenHash,
    ],
  );
  return sessionResult.insertId;
}

export function createSessionsRepository(pool: Pool): SessionsRepository {
  return {
    async create(record) {
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        const sessionId = await insertUserAndSession(connection, record);
        await connection.commit();
        return sessionId;
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    },

    async findOwnership(sessionId) {
      const [rows] = await pool.query<SessionOwnershipRecord[]>(
        'SELECT id, student_id, write_token_hash FROM sessions WHERE id = ?',
        [sessionId],
      );
      return rows[0] ?? null;
    },

    async findStartedSession(sessionId) {
      const [rows] = await pool.query<StartedSessionRow[]>(
        'SELECT started_at FROM sessions WHERE id = ?',
        [sessionId],
      );
      return rows[0] ?? null;
    },

    async end(sessionId) {
      await pool.query(
        'UPDATE sessions SET ended_at = NOW(), duration_seconds = TIMESTAMPDIFF(SECOND, started_at, NOW()) WHERE id = ?',
        [sessionId],
      );
    },
  };
}
