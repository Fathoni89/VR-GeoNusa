import { Router, type RequestHandler } from 'express';
import { assertFileIdentifier } from '../../shared/ids';
import { collectBoundedStream } from '../../shared/bounded-stream';
import type { DatasetService } from './dataset.service';

export { collectBoundedStream } from '../../shared/bounded-stream';

export const MAX_DATASET_IMAGE_BYTES = 5 * 1024 * 1024;

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
