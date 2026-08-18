import { z } from 'zod';

export const createSchoolSchema = z.object({
  name: z.string().min(1),
  code: z.string().nullable().optional(),
}).passthrough();

export type CreateSchoolInput = z.infer<typeof createSchoolSchema>;
