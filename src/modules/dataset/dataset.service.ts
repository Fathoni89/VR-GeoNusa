import crypto from 'node:crypto';
import { assertFileIdentifier } from '../../shared/ids';
import type { ToursRepository } from '../tours/tours.repository';
import type { DatasetRepository } from './dataset.repository';
import {
  datasetProvenanceSchema,
  detectImageType,
  normalizeImageContentType,
  selectDatasetSplit,
  type DatasetProvenanceInput,
} from './dataset.schema';

interface ServiceError {
  ok: false;
  status: number;
  message: string;
}

interface ServiceSuccess<T> {
  ok: true;
  value: T;
}

export type DatasetServiceResult<T> = ServiceSuccess<T> | ServiceError;

export interface DatasetUploadInput {
  classId: unknown;
  contentType: string;
  image: Buffer;
  provenance: DatasetProvenanceInput;
}

export interface DatasetService {
  upload(input: DatasetUploadInput): DatasetServiceResult<{
    filename: string;
    classId: string;
    total: number;
  }>;
  stats(): ReturnType<DatasetRepository['stats']>;
}

export function createDatasetService(
  repository: DatasetRepository,
  toursRepository: ToursRepository,
): DatasetService {
  return {
    upload(input) {
      const classId = assertFileIdentifier(input.classId, 'class_id');
      const provenance = datasetProvenanceSchema.safeParse(input.provenance);
      if (!provenance.success) {
        return { ok: false, status: 400, message: 'Metadata provenance dataset tidak valid' };
      }

      const taxonomy = toursRepository.readTaxonomy();
      const validIds = taxonomy.classes.map(item => item.class_id);
      if (!validIds.includes(classId)) {
        return {
          ok: false,
          status: 400,
          message: `class_id "${classId}" tidak dikenal. Valid: ${validIds.join(', ')}`,
        };
      }
      if (provenance.data.taxonomyVersion !== taxonomy._version) {
        return { ok: false, status: 400, message: 'Versi taxonomy dataset tidak sesuai' };
      }

      const tour = toursRepository.read(provenance.data.tourId);
      const node = tour?.nodes.find(item => item.id === provenance.data.nodeId);
      if (!node) {
        return { ok: false, status: 400, message: 'Source panorama/node tidak valid' };
      }

      const imageType = detectImageType(input.image);
      const contentType = normalizeImageContentType(input.contentType);
      if (!imageType || imageType.mimeType !== contentType) {
        return { ok: false, status: 415, message: 'File harus berupa JPEG atau PNG yang valid' };
      }

      const sourceId = `${provenance.data.tourId}:${provenance.data.nodeId}`;
      const split = selectDatasetSplit(sourceId, taxonomy.split_ratio);
      const stored = repository.write({
        classId,
        split,
        image: input.image,
        imageType,
        metadata: {
          schema_version: 1,
          source_id: sourceId,
          tour_id: provenance.data.tourId,
          node_id: provenance.data.nodeId,
          panorama: node.image,
          taxonomy_version: taxonomy._version,
          image_sha256: crypto.createHash('sha256').update(input.image).digest('hex'),
          split,
          mime_type: imageType.mimeType,
        },
      });
      return {
        ok: true,
        value: { filename: stored.filename, classId, total: stored.total },
      };
    },

    stats() {
      const taxonomy = toursRepository.readTaxonomy();
      return repository.stats(taxonomy.classes.map(item => item.class_id));
    },
  };
}
