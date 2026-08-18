import type { StudentPrincipal } from '../../shared/types';
import type { SessionsService } from '../sessions/sessions.service';
import {
  interactionSchema,
  predictionSchema,
  quizResultSchema,
} from './learning-events.schema';
import type { LearningEventsRepository } from './learning-events.repository';

interface ServiceError {
  ok: false;
  status: number;
  message: string;
}

interface ServiceSuccess {
  ok: true;
}

export type LearningEventResult = ServiceSuccess | ServiceError;

export interface ObjectReference {
  object_code: unknown;
  object_name: unknown;
  geometry_label: unknown;
}

export interface ObjectResolver {
  resolve(reference: ObjectReference): Promise<number | null>;
}

export interface QuizQuestion {
  options?: unknown;
  correct_answer?: unknown;
}

export interface QuizQuestionProvider {
  find(questionId: unknown): QuizQuestion | null;
}

export interface EventRequestContext {
  student: StudentPrincipal | null;
  sessionToken: string | undefined;
}

export interface LearningEventsService {
  createInteraction(context: EventRequestContext, body: unknown): Promise<LearningEventResult>;
  createPrediction(context: EventRequestContext, body: unknown): Promise<LearningEventResult>;
  createQuizResult(context: EventRequestContext, body: unknown): Promise<LearningEventResult>;
}

const missingEventFields = (): ServiceError => ({
  ok: false,
  status: 400,
  message: 'session_id dan object_code wajib diisi',
});

const forbiddenSession = (): ServiceError => ({
  ok: false,
  status: 403,
  message: 'Tidak punya akses ke sesi ini',
});

export function createLearningEventsService(
  repository: LearningEventsRepository,
  sessions: SessionsService,
  objects: ObjectResolver,
  quiz: QuizQuestionProvider,
): LearningEventsService {
  async function ownsSession(context: EventRequestContext, sessionId: unknown): Promise<boolean> {
    return sessions.owns(context.student, sessionId, context.sessionToken);
  }

  return {
    async createInteraction(context, body) {
      const parsed = interactionSchema.safeParse(body);
      const input = parsed.success ? parsed.data : {};
      if (!input.session_id || !input.object_code) return missingEventFields();
      if (!await ownsSession(context, input.session_id)) return forbiddenSession();
      const objectId = await objects.resolve({
        object_code: input.object_code,
        object_name: input.object_name,
        geometry_label: input.geometry_label,
      });
      await repository.createInteraction({
        sessionId: input.session_id,
        objectId,
        interactionType: input.interaction_type,
        gazeDuration: input.gaze_duration,
      });
      return { ok: true };
    },

    async createPrediction(context, body) {
      const parsed = predictionSchema.safeParse(body);
      const input = parsed.success ? parsed.data : {};
      if (!input.session_id || !input.object_code) return missingEventFields();
      if (!await ownsSession(context, input.session_id)) return forbiddenSession();
      const objectId = await objects.resolve({
        object_code: input.object_code,
        object_name: input.object_name,
        geometry_label: input.geometry_label,
      });
      await repository.createPrediction({
        sessionId: input.session_id,
        objectId,
        predictedLabel: input.predicted_label,
        confidenceScore: input.confidence_score,
      });
      return { ok: true };
    },

    async createQuizResult(context, body) {
      const parsed = quizResultSchema.safeParse(body);
      const input = parsed.success ? parsed.data : {};
      if (!input.session_id || !input.question_id) {
        return {
          ok: false,
          status: 400,
          message: 'session_id dan question_id wajib diisi',
        };
      }
      if (!await ownsSession(context, input.session_id)) return forbiddenSession();

      const question = quiz.find(input.question_id);
      if (!question) {
        return { ok: false, status: 400, message: 'question_id tidak valid' };
      }
      if (
        typeof input.answer !== 'string'
        || !Array.isArray(question.options)
        || !question.options.includes(input.answer)
      ) {
        return { ok: false, status: 400, message: 'answer tidak valid' };
      }

      const responseTime = input.response_time == null ? null : input.response_time;
      if (
        responseTime !== null
        && (
          typeof responseTime !== 'number'
          || !Number.isFinite(responseTime)
          || responseTime < 0
          || responseTime > 600
        )
      ) {
        return {
          ok: false,
          status: 400,
          message: 'response_time harus berupa angka antara 0 dan 600 detik',
        };
      }

      await repository.createQuizResult({
        sessionId: input.session_id,
        questionId: input.question_id,
        answer: input.answer,
        isCorrect: input.answer === question.correct_answer,
        responseTime,
      });
      return { ok: true };
    },
  };
}
