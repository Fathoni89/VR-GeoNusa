import { z } from 'zod';

export const createAccountSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
  role: z.unknown().optional(),
  school_id: z.unknown().optional(),
}).passthrough();

export const resetAccountPasswordSchema = z.object({
  new_password: z.string().min(6),
}).passthrough();

export type CreateAccountInput = z.infer<typeof createAccountSchema>;
