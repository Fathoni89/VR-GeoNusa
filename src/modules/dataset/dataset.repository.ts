import crypto from 'node:crypto';
import fs from 'node:fs';
import { assertFileIdentifier, resolveIdentifierPath, resolveWithin } from '../../shared/ids';
import type { DatasetSplit, DetectedImageType } from './dataset.schema';

export interface DatasetMetadata {
  schema_version: 1;
  source_id: string;
  tour_id: string;
  node_id: string;
  panorama: string;
  taxonomy_version: string;
  image_sha256: string;
  split: DatasetSplit;
  mime_type: DetectedImageType['mimeType'];
  created_at: string;
}

export type DatasetMetadataInput = Omit<DatasetMetadata, 'created_at'>;

export interface DatasetWriteInput {
  classId: string;
  split: DatasetSplit;
  image: Buffer;
  imageType: DetectedImageType;
  metadata: DatasetMetadataInput;
}

export interface DatasetWriteResult {
  filename: string;
  total: number;
}

export interface DatasetStatsRow {
  class_id: string;
  train: number;
  val: number;
  test: number;
  total: number;
}

export interface DatasetRepository {
  write(input: DatasetWriteInput): DatasetWriteResult;
  stats(classIds: string[]): DatasetStatsRow[];
}

export interface DatasetRepositoryOptions {
  datasetDir: string;
  createId?: () => string;
  now?: () => Date;
}

function isImageFilename(filename: string): boolean {
  return filename.endsWith('.jpg') || filename.endsWith('.png');
}

function countImages(directory: string): number {
  return fs.existsSync(directory)
    ? fs.readdirSync(directory).filter(isImageFilename).length
    : 0;
}

export function createDatasetRepository(options: DatasetRepositoryOptions): DatasetRepository {
  const createId = options.createId ?? crypto.randomUUID;
  const now = options.now ?? (() => new Date());

  return {
    write(input) {
      const classId = assertFileIdentifier(input.classId, 'class_id');
      const generatedId = assertFileIdentifier(createId(), 'dataset_id');
      const filename = `${classId}_${generatedId}.${input.imageType.extension}`;
      const classDirectory = resolveIdentifierPath(
        resolveWithin(options.datasetDir, input.split),
        { id: classId, label: 'class_id' },
      );
      fs.mkdirSync(classDirectory, { recursive: true });
      const imagePath = resolveWithin(classDirectory, filename);
      const metadataPath = resolveWithin(classDirectory, `${filename}.metadata.json`);
      const metadata = { ...input.metadata, created_at: now().toISOString() };
      let imageCreated = false;
      let metadataCreated = false;

      try {
        fs.writeFileSync(imagePath, input.image, { flag: 'wx' });
        imageCreated = true;
        fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), {
          encoding: 'utf8',
          flag: 'wx',
        });
        metadataCreated = true;
      } catch (error) {
        if (metadataCreated && fs.existsSync(metadataPath)) fs.unlinkSync(metadataPath);
        if (imageCreated && fs.existsSync(imagePath)) fs.unlinkSync(imagePath);
        throw error;
      }

      const total = (['train', 'val', 'test'] as const).reduce((sum, split) => {
        const directory = resolveIdentifierPath(
          resolveWithin(options.datasetDir, split),
          { id: classId, label: 'class_id' },
        );
        return sum + countImages(directory);
      }, 0);
      return { filename, total };
    },

    stats(classIds) {
      return classIds.map(value => {
        const classId = assertFileIdentifier(value, 'class_id');
        const counts = {
          train: countImages(resolveIdentifierPath(
            resolveWithin(options.datasetDir, 'train'),
            { id: classId, label: 'class_id' },
          )),
          val: countImages(resolveIdentifierPath(
            resolveWithin(options.datasetDir, 'val'),
            { id: classId, label: 'class_id' },
          )),
          test: countImages(resolveIdentifierPath(
            resolveWithin(options.datasetDir, 'test'),
            { id: classId, label: 'class_id' },
          )),
        };
        return {
          class_id: classId,
          ...counts,
          total: counts.train + counts.val + counts.test,
        };
      });
    },
  };
}
