import { z } from 'zod';
import { FILE_IDENTIFIER_PATTERN } from '../../shared/ids';

const nonBlankString = z.string().refine(value => value.trim().length > 0);

export const teamMemberSchema = z.object({
  id: z.string().regex(FILE_IDENTIFIER_PATTERN),
  name: nonBlankString,
  role: z.string().optional(),
  role_type: z.string().optional(),
  institution: z.string().optional(),
  department: z.string().optional(),
  bio: z.string().optional(),
  expertise: z.array(z.string()).optional(),
  photo: z.string().optional(),
  email: z.string().optional(),
  sinta_id: z.string().optional(),
  orcid: z.string().optional(),
  order: z.number().int().positive().optional(),
}).passthrough();

export const teamUpdateSchema = teamMemberSchema.partial();

export const teamReorderSchema = z.object({
  order: z.array(z.string().regex(FILE_IDENTIFIER_PATTERN)),
});

export const storedTeamSchema = z.array(teamMemberSchema);

export type TeamMember = z.infer<typeof teamMemberSchema>;

export function parseStoredTeam(value: unknown): TeamMember[] {
  const parsed = storedTeamSchema.safeParse(value);
  if (!parsed.success) throw new Error('Data tim tersimpan tidak valid');
  return parsed.data;
}
