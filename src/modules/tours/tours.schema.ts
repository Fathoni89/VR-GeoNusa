import { z } from 'zod';
import { FILE_IDENTIFIER_PATTERN } from '../../shared/ids';

export const taxonomyClassSchema = z.object({
  class_id: z.string().regex(FILE_IDENTIFIER_PATTERN),
  label_id: z.string(),
  label_en: z.string(),
  sisi: z.number(),
  rusuk: z.number(),
  titik: z.number(),
  volume: z.string(),
  luas: z.string(),
}).passthrough();

export const taxonomySchema = z.object({
  _version: z.string().min(1),
  split_ratio: z.object({
    train: z.number().min(0).max(1),
    val: z.number().min(0).max(1),
    test: z.number().min(0).max(1),
  }).refine(
    ratio => Math.abs(ratio.train + ratio.val + ratio.test - 1) < 0.000001,
    { message: 'Rasio split taxonomy harus berjumlah 1' },
  ),
  classes: z.array(taxonomyClassSchema),
}).passthrough();

export const tourIdentifySchema = z.object({
  class_id: z.string().regex(FILE_IDENTIFIER_PATTERN),
}).passthrough();

export const tourNodeSchema = z.object({
  id: z.string().regex(FILE_IDENTIFIER_PATTERN),
  folder: z.string().min(1),
  image: z.string().min(1),
  identify: tourIdentifySchema.optional(),
}).passthrough();

export const tourDocumentSchema = z.object({
  tour_id: z.string().min(1),
  name: z.string().optional(),
  source: z.string().optional(),
  folder_order: z.array(z.string()),
  nodes: z.array(tourNodeSchema),
}).passthrough();

export type GeometryTaxonomy = z.infer<typeof taxonomySchema>;
export type TourDocument = z.infer<typeof tourDocumentSchema>;

export function parseStoredTaxonomy(value: unknown): GeometryTaxonomy {
  const parsed = taxonomySchema.safeParse(value);
  if (!parsed.success) throw new Error('Taxonomy geometri tersimpan tidak valid');
  return parsed.data;
}

export function parseStoredTour(value: unknown): TourDocument {
  const parsed = tourDocumentSchema.safeParse(value);
  if (!parsed.success) throw new Error('Data tur tersimpan tidak valid');
  return parsed.data;
}
