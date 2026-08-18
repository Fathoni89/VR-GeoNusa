import { assertFileIdentifier } from '../../shared/ids';
import type { ToursRepository } from './tours.repository';

interface ServiceError {
  ok: false;
  status: number;
  message: string;
}

interface ServiceSuccess<T> {
  ok: true;
  value: T;
}

export type ToursServiceResult<T> = ServiceSuccess<T> | ServiceError;

export interface TourSummary {
  tour_id: string;
  name: string;
  source: string;
  node_count: number;
  identified_count: number;
  area_count: number;
}

export interface ToursService {
  list(): TourSummary[];
  updateFolder(
    tourId: unknown,
    folder: unknown,
    body: unknown,
  ): ToursServiceResult<{ folder: string; appliedTo: number; identify: unknown }>;
}

function bodyRecord(body: unknown): Record<string, unknown> {
  return typeof body === 'object' && body !== null ? body as Record<string, unknown> : {};
}

export function createToursService(repository: ToursRepository): ToursService {
  return {
    list() {
      return repository.listIds().map(tourId => {
        const tour = repository.read(tourId);
        if (!tour) return null;
        return {
          tour_id: tourId,
          name: tour.name || tourId,
          source: tour.source || '',
          node_count: tour.nodes.length,
          identified_count: tour.nodes.filter(node => node.identify).length,
          area_count: tour.folder_order.length,
        };
      }).filter((tour): tour is TourSummary => tour !== null);
    },

    updateFolder(tourId, folder, body) {
      const id = assertFileIdentifier(tourId, 'tour_id');
      if (typeof folder !== 'string' || folder.length === 0) {
        return { ok: false, status: 400, message: 'Area tidak valid' };
      }
      const tour = repository.read(id);
      if (!tour) return { ok: false, status: 404, message: 'Tur tidak ditemukan' };

      const nodes = tour.nodes.filter(node => node.folder === folder);
      if (nodes.length === 0) {
        return { ok: false, status: 404, message: `Area "${folder}" tidak ditemukan` };
      }

      const input = bodyRecord(body);
      if (!input.class_id) {
        for (const node of nodes) delete node.identify;
      } else {
        const taxonomy = repository.readTaxonomy();
        const geometryClass = taxonomy.classes.find(item => item.class_id === input.class_id);
        if (!geometryClass) {
          return {
            ok: false,
            status: 400,
            message: `class_id "${String(input.class_id)}" tidak dikenal`,
          };
        }

        const identify = {
          class_id: geometryClass.class_id,
          object_id: null,
          geo: geometryClass.label_id,
          geo_en: geometryClass.label_en,
          sisi: geometryClass.sisi,
          rusuk: geometryClass.rusuk,
          titik: geometryClass.titik,
          volume: geometryClass.volume,
          luas: geometryClass.luas,
          element: input.element || geometryClass.label_id,
          context: input.context || '',
          conf: typeof input.conf === 'number' ? input.conf : 85,
          local_angle: 40,
        };
        for (const node of nodes) node.identify = identify;
      }

      repository.write(id, tour);
      return {
        ok: true,
        value: {
          folder,
          appliedTo: nodes.length,
          identify: nodes[0]?.identify ?? null,
        },
      };
    },
  };
}
