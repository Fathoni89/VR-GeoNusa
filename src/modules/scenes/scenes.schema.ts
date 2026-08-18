import { z } from 'zod';
import { FILE_IDENTIFIER_PATTERN } from '../../shared/ids';
import { sceneObjectSchema } from '../objects/objects.schema';

export const sceneDocumentSchema = z.object({
  scene_id: z.string().regex(FILE_IDENTIFIER_PATTERN),
  name: z.string().refine(value => value.trim().length > 0),
  objects: z.array(sceneObjectSchema),
}).passthrough();

export type SceneDocument = z.infer<typeof sceneDocumentSchema>;

export function parseStoredScene(value: unknown): SceneDocument {
  const parsed = sceneDocumentSchema.safeParse(value);
  if (!parsed.success) throw new Error('Data scene tersimpan tidak valid');
  return parsed.data;
}
