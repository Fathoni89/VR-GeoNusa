import { z } from 'zod';

export const createClassSchema = z.object({
  class_name: z.string().min(1).max(100),
  grade_level: z.string().max(20).nullable().optional(),
  academic_year: z.string().max(20).nullable().optional(),
  teacher_account_id: z.unknown().optional(),
}).passthrough();

export type CreateClassInput = z.infer<typeof createClassSchema>;
