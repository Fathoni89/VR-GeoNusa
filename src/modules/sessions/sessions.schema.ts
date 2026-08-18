import { z } from 'zod';

export const createSessionSchema = z.object({
  student_name: z.unknown().optional(),
  role: z.unknown().optional(),
  school_id: z.unknown().optional(),
  scene_name: z.unknown().optional(),
  device_type: z.unknown().optional(),
}).passthrough();
