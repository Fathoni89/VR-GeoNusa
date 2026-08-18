import { Router, type RequestHandler } from 'express';
import { assertFileIdentifier } from '../../shared/ids';
import type { DatasetService } from './dataset.service';

export const MAX_DATASET_IMAGE_BYTES = 5 * 1024 * 1024;

interface BoundedStreamSuccess {
  ok: true;
  buffer: Buffer;
}

interface BoundedStreamTooLarge {
  ok: false;
  tooLarge: true;
}

export async function collectBoundedStream(
  stream: NodeJS.ReadableStream,
  maxBytes: number,
): Promise<BoundedStreamSuccess | BoundedStreamTooLarge> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let tooLarge = false;

    stream.on('data', (value: Buffer | string) => {
      const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
      size += chunk.length;
      if (size > maxBytes) {
        tooLarge = true;
        chunks.length = 0;
        return;
      }
      if (!tooLarge) chunks.push(chunk);
    });
    stream.on('end', () => {
      resolve(tooLarge
        ? { ok: false, tooLarge: true }
        : { ok: true, buffer: Buffer.concat(chunks, size) });
    });
    stream.on('error', reject);
  });
}

type AsyncHandler = (
  request: Parameters<RequestHandler>[0],
  response: Parameters<RequestHandler>[1],
) => Promise<void>;

function forwardAsync(handler: AsyncHandler): RequestHandler {
  return (request, response, next) => {
    void handler(request, response).catch(next);
  };
}

export interface DatasetRouterOptions {
  service: DatasetService;
  requireAuth: RequestHandler;
  requireSuperAdmin: RequestHandler;
}

export function createDatasetRouter(options: DatasetRouterOptions): Router {
  const router = Router();

  router.post(
    '/:classId',
    options.requireAuth,
    options.requireSuperAdmin,
    forwardAsync(async (request, response) => {
      const classId = assertFileIdentifier(request.params.classId, 'class_id');
      const collected = await collectBoundedStream(request, MAX_DATASET_IMAGE_BYTES);
      if (!collected.ok) {
        response.status(413).json({ success: false, message: 'Gambar maksimal 5MB' });
        return;
      }

      const result = options.service.upload({
        classId,
        contentType: request.get('content-type') ?? '',
        image: collected.buffer,
        provenance: {
          tourId: request.get('X-Dataset-Tour-Id') ?? '',
          nodeId: request.get('X-Dataset-Node-Id') ?? '',
          taxonomyVersion: request.get('X-Taxonomy-Version') ?? '',
        },
      });
      if (!result.ok) {
        response.status(result.status).json({ success: false, message: result.message });
        return;
      }
      response.status(201).json({
        success: true,
        filename: result.value.filename,
        class_id: result.value.classId,
        total: result.value.total,
      });
    }),
  );

  router.get('/stats', (_request, response) => {
    response.json({ success: true, data: options.service.stats() });
  });

  return router;
}
