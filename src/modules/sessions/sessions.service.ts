import type { StudentPrincipal } from '../../shared/types';
import { createSessionSchema } from './sessions.schema';
import type { SessionsRepository } from './sessions.repository';

interface ServiceError {
  ok: false;
  status: number;
  message: string;
}

interface ServiceSuccess<T> {
  ok: true;
  value: T;
}

export type SessionsServiceResult<T> = ServiceSuccess<T> | ServiceError;

export interface SessionTokenCodec {
  generate(): string;
  hash(token: string): string;
  equalHash(suppliedHash: string, storedHash: string): boolean;
}

export interface CreatedSession {
  session_id: number;
  session_token?: string;
}

export interface SessionsService {
  create(student: StudentPrincipal | null, body: unknown): Promise<CreatedSession>;
  owns(
    student: StudentPrincipal | null,
    sessionId: unknown,
    suppliedToken: string | undefined,
  ): Promise<boolean>;
  end(
    student: StudentPrincipal | null,
    sessionId: string,
    suppliedToken: string | undefined,
  ): Promise<SessionsServiceResult<null>>;
}

export function createSessionsService(
  repository: SessionsRepository,
  tokens: SessionTokenCodec,
): SessionsService {
  const owns: SessionsService['owns'] = async (student, sessionId, suppliedToken) => {
    const session = await repository.findOwnership(sessionId);
    if (!session) return false;
    if (
      student
      && session.student_id !== null
      && String(session.student_id) === String(student.student_id)
    ) {
      return true;
    }
    if (!suppliedToken || !session.write_token_hash) return false;
    return tokens.equalHash(tokens.hash(suppliedToken), String(session.write_token_hash));
  };

  return {
    async create(student, body) {
      const parsed = createSessionSchema.safeParse(body);
      const input = parsed.success ? parsed.data : {};
      const name = student
        ? student.name
        : typeof input.student_name === 'string'
          ? (input.student_name || 'Anonim').trim().slice(0, 100)
          : 'Anonim';
      const schoolId = student ? student.school_id : (input.school_id || null);
      const sessionToken = student ? null : tokens.generate();
      const sessionId = await repository.create({
        name,
        role: input.role || 'siswa',
        schoolId,
        studentId: student ? student.student_id : null,
        classId: student ? student.class_id : null,
        sceneName: input.scene_name || 'borobudur-360',
        deviceType: input.device_type || 'desktop',
        writeTokenHash: sessionToken ? tokens.hash(sessionToken) : null,
      });
      return {
        session_id: sessionId,
        ...(sessionToken ? { session_token: sessionToken } : {}),
      };
    },

    owns,

    async end(student, sessionId, suppliedToken) {
      if (!await owns(student, sessionId, suppliedToken)) {
        return { ok: false, status: 403, message: 'Tidak punya akses ke sesi ini' };
      }
      const session = await repository.findStartedSession(sessionId);
      if (!session) return { ok: false, status: 404, message: 'Sesi tidak ditemukan' };
      await repository.end(sessionId);
      return { ok: true, value: null };
    },
  };
}
