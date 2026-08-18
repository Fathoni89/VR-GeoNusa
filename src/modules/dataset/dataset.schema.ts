import crypto from 'node:crypto';
import { z } from 'zod';
import { FILE_IDENTIFIER_PATTERN } from '../../shared/ids';

export const DATASET_SPLITS = ['train', 'val', 'test'] as const;
export type DatasetSplit = typeof DATASET_SPLITS[number];

export interface DatasetSplitRatio {
  train: number;
  val: number;
  test: number;
}

export interface DetectedImageType {
  mimeType: 'image/jpeg' | 'image/png';
  extension: 'jpg' | 'png';
}

export const datasetProvenanceSchema = z.object({
  tourId: z.string().regex(FILE_IDENTIFIER_PATTERN),
  nodeId: z.string().regex(FILE_IDENTIFIER_PATTERN),
  taxonomyVersion: z.string().min(1).max(100),
});

export type DatasetProvenanceInput = z.infer<typeof datasetProvenanceSchema>;

export function detectImageType(buffer: Buffer): DetectedImageType | null {
  if (
    buffer.length >= 3
    && buffer[0] === 0xff
    && buffer[1] === 0xd8
    && buffer[2] === 0xff
  ) {
    return { mimeType: 'image/jpeg', extension: 'jpg' };
  }

  const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (buffer.length >= pngSignature.length && buffer.subarray(0, 8).equals(pngSignature)) {
    return { mimeType: 'image/png', extension: 'png' };
  }
  return null;
}

export function normalizeImageContentType(value: string): string {
  return value.split(';', 1)[0]?.trim().toLowerCase() ?? '';
}

export function selectDatasetSplit(
  sourceId: string,
  ratio: DatasetSplitRatio,
): DatasetSplit {
  const digest = crypto.createHash('sha256').update(sourceId, 'utf8').digest();
  const position = digest.readUInt32BE(0) / 0x100000000;
  if (position < ratio.train) return 'train';
  if (position < ratio.train + ratio.val) return 'val';
  return 'test';
}
