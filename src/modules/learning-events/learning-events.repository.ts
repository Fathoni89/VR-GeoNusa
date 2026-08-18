import type { Pool } from 'mysql2/promise';

export interface LearningEventsRepository {
  createInteraction(input: {
    sessionId: unknown;
    objectId: number | null;
    interactionType: unknown;
    gazeDuration: unknown;
  }): Promise<void>;
  createPrediction(input: {
    sessionId: unknown;
    objectId: number | null;
    predictedLabel: unknown;
    confidenceScore: unknown;
  }): Promise<void>;
  createQuizResult(input: {
    sessionId: unknown;
    questionId: unknown;
    answer: string;
    isCorrect: boolean;
    responseTime: number | null;
  }): Promise<void>;
}

export function createLearningEventsRepository(pool: Pool): LearningEventsRepository {
  return {
    async createInteraction(input) {
      await pool.query(
        'INSERT INTO interactions (session_id, object_id, interaction_type, gaze_duration) VALUES (?, ?, ?, ?)',
        [input.sessionId, input.objectId, input.interactionType || 'visit', input.gazeDuration || null],
      );
    },

    async createPrediction(input) {
      await pool.query(
        'INSERT INTO predictions (session_id, object_id, predicted_label, confidence_score) VALUES (?, ?, ?, ?)',
        [input.sessionId, input.objectId, input.predictedLabel || '', input.confidenceScore || 0],
      );
    },

    async createQuizResult(input) {
      await pool.query(
        'INSERT INTO quiz_results (session_id, question_id, answer, is_correct, response_time) VALUES (?, ?, ?, ?, ?)',
        [
          input.sessionId,
          input.questionId,
          input.answer,
          input.isCorrect ? 1 : 0,
          input.responseTime,
        ],
      );
    },
  };
}
