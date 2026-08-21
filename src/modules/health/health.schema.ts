import { z } from 'zod';

export const livenessSchema = z.object({
  success: z.literal(true),
  message: z.literal('VR-GeoNusa server running'),
  version: z.string(),
  status: z.literal('live'),
  timestamp: z.string(),
});

export const readinessSchema = z.object({
  success: z.boolean(),
  status: z.enum(['ready', 'unavailable']),
  component: z.enum(['database', 'ml']),
  timestamp: z.string(),
});

export type Liveness = z.infer<typeof livenessSchema>;
export type Readiness = z.infer<typeof readinessSchema>;
