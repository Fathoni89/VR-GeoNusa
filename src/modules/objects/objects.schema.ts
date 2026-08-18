import { z } from 'zod';
import { FILE_IDENTIFIER_PATTERN } from '../../shared/ids';

export const sceneObjectIdSchema = z.string().regex(FILE_IDENTIFIER_PATTERN);

export const sceneObjectSchema = z.object({
  id: sceneObjectIdSchema,
}).passthrough();

export type SceneObject = z.infer<typeof sceneObjectSchema>;
