import { z } from 'zod';

export const interactionSchema = z.object({
  session_id: z.unknown().optional(),
  object_code: z.unknown().optional(),
  object_name: z.unknown().optional(),
  geometry_label: z.unknown().optional(),
  interaction_type: z.unknown().optional(),
  gaze_duration: z.unknown().optional(),
}).passthrough();

export const predictionSchema = z.object({
  session_id: z.unknown().optional(),
  object_code: z.unknown().optional(),
  object_name: z.unknown().optional(),
  geometry_label: z.unknown().optional(),
  predicted_label: z.unknown().optional(),
  confidence_score: z.unknown().optional(),
}).passthrough();

export const quizResultSchema = z.object({
  session_id: z.unknown().optional(),
  question_id: z.unknown().optional(),
  answer: z.unknown().optional(),
  response_time: z.unknown().optional(),
}).passthrough();
