import { assertFileIdentifier } from '../../shared/ids';
import { sceneDocumentSchema, type SceneDocument } from './scenes.schema';
import type { ScenesRepository } from './scenes.repository';

interface ServiceError {
  ok: false;
  status: number;
  message: string;
}

interface ServiceSuccess<T> {
  ok: true;
  value: T;
}

export type ScenesServiceResult<T> = ServiceSuccess<T> | ServiceError;

export interface SceneSummary {
  scene_id: string;
  name: string;
  location: unknown;
  era: unknown;
  obj_count: number;
}

export interface SceneRenderer {
  render(scene: SceneDocument): string;
}

export interface ScenesService {
  list(): SceneSummary[];
  get(sceneId: unknown): ScenesServiceResult<SceneDocument>;
  create(body: unknown): ScenesServiceResult<{ scene: SceneDocument; vrUrl: string }>;
  update(sceneId: unknown, body: unknown): ScenesServiceResult<SceneDocument>;
  delete(sceneId: unknown): ScenesServiceResult<string>;
}

const invalidScene = (): ServiceError => ({
  ok: false,
  status: 400,
  message: 'Data scene tidak valid',
});

function bodyRecord(body: unknown): Record<string, unknown> {
  return typeof body === 'object' && body !== null ? body as Record<string, unknown> : {};
}

export function createScenesService(
  repository: ScenesRepository,
  renderer: SceneRenderer,
): ScenesService {
  return {
    list() {
      return repository.list().map(scene => ({
        scene_id: scene.scene_id,
        name: scene.name,
        location: scene.location,
        era: scene.era,
        obj_count: scene.objects.length,
      }));
    },

    get(sceneId) {
      const id = assertFileIdentifier(sceneId, 'scene_id');
      const scene = repository.read(id);
      return scene
        ? { ok: true, value: scene }
        : { ok: false, status: 404, message: 'Scene tidak ditemukan' };
    },

    create(body) {
      const input = bodyRecord(body);
      if (!input.scene_id || !input.name) {
        return { ok: false, status: 400, message: 'scene_id dan name wajib diisi' };
      }
      const id = assertFileIdentifier(input.scene_id, 'scene_id');
      if (repository.read(id)) {
        return { ok: false, status: 409, message: `Scene "${id}" sudah ada` };
      }
      const candidate = {
        scene_id: id,
        name: input.name,
        location: input.location || '',
        era: input.era || '',
        sky_color: input.sky_color || '#1a2744',
        ground_color: input.ground_color || '#2d4a2a',
        cursor_color: input.cursor_color || '#00e5ff',
        label_color: input.label_color || '#00e5ff',
        objects: [],
      };
      const parsed = sceneDocumentSchema.safeParse(candidate);
      if (!parsed.success) return invalidScene();
      repository.write(parsed.data);
      repository.writeVr(id, renderer.render(parsed.data));
      return {
        ok: true,
        value: { scene: parsed.data, vrUrl: `/vr/${id}.html` },
      };
    },

    update(sceneId, body) {
      const id = assertFileIdentifier(sceneId, 'scene_id');
      const scene = repository.read(id);
      if (!scene) return { ok: false, status: 404, message: 'Scene tidak ditemukan' };
      const input = bodyRecord(body);
      const allowed = [
        'name',
        'location',
        'era',
        'sky_color',
        'ground_color',
        'cursor_color',
        'label_color',
      ];
      for (const key of allowed) {
        if (input[key] !== undefined) scene[key] = input[key];
      }
      const parsed = sceneDocumentSchema.safeParse(scene);
      if (!parsed.success) return invalidScene();
      repository.write(parsed.data);
      repository.writeVr(id, renderer.render(parsed.data));
      return { ok: true, value: parsed.data };
    },

    delete(sceneId) {
      const id = assertFileIdentifier(sceneId, 'scene_id');
      if (id === 'prambanan') {
        return { ok: false, status: 403, message: 'Scene default tidak bisa dihapus' };
      }
      if (!repository.delete(id)) {
        return { ok: false, status: 404, message: 'Scene tidak ditemukan' };
      }
      return { ok: true, value: `Scene "${id}" berhasil dihapus` };
    },
  };
}
