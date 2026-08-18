import { assertFileIdentifier } from '../../shared/ids';
import { sceneDocumentSchema } from '../scenes/scenes.schema';
import { sceneObjectIdSchema, sceneObjectSchema, type SceneObject } from './objects.schema';
import type { ObjectsRepository } from './objects.repository';

interface ServiceError {
  ok: false;
  status: number;
  message: string;
}

interface ServiceSuccess<T> {
  ok: true;
  value: T;
}

export type ObjectsServiceResult<T> = ServiceSuccess<T> | ServiceError;

export interface ObjectsService {
  list(sceneId: unknown): ObjectsServiceResult<SceneObject[]>;
  create(sceneId: unknown, body: unknown): ObjectsServiceResult<SceneObject>;
  update(sceneId: unknown, objectId: unknown, body: unknown): ObjectsServiceResult<SceneObject>;
  delete(sceneId: unknown, objectId: unknown): ObjectsServiceResult<string>;
}

const invalidScene = (): ServiceError => ({
  ok: false,
  status: 400,
  message: 'Data scene tidak valid',
});

function getScene(repository: ObjectsRepository, sceneId: unknown) {
  const id = assertFileIdentifier(sceneId, 'scene_id');
  return { id, scene: repository.readScene(id) };
}

export function createObjectsService(repository: ObjectsRepository): ObjectsService {
  return {
    list(sceneId) {
      const { scene } = getScene(repository, sceneId);
      return scene
        ? { ok: true, value: scene.objects }
        : { ok: false, status: 404, message: 'Scene tidak ditemukan' };
    },

    create(sceneId, body) {
      const { scene } = getScene(repository, sceneId);
      if (!scene) return { ok: false, status: 404, message: 'Scene tidak ditemukan' };
      const input = typeof body === 'object' && body !== null
        ? body as Record<string, unknown>
        : {};
      if (!input.id) return { ok: false, status: 400, message: 'Field "id" wajib diisi' };
      const parsedObject = sceneObjectSchema.safeParse(input);
      if (!parsedObject.success) return invalidScene();
      if (scene.objects.find(object => object.id === parsedObject.data.id)) {
        return {
          ok: false,
          status: 409,
          message: `ID "${parsedObject.data.id}" sudah ada`,
        };
      }
      const candidate = { ...scene, objects: [...scene.objects, parsedObject.data] };
      const parsedScene = sceneDocumentSchema.safeParse(candidate);
      if (!parsedScene.success) return invalidScene();
      repository.writeScene(parsedScene.data);
      return { ok: true, value: parsedObject.data };
    },

    update(sceneId, objectId, body) {
      const { scene } = getScene(repository, sceneId);
      if (!scene) return { ok: false, status: 404, message: 'Scene tidak ditemukan' };
      const parsedId = sceneObjectIdSchema.safeParse(objectId);
      if (!parsedId.success) return invalidScene();
      const index = scene.objects.findIndex(object => object.id === parsedId.data);
      if (index < 0) return { ok: false, status: 404, message: 'Objek tidak ditemukan' };
      const input = typeof body === 'object' && body !== null
        ? body as Record<string, unknown>
        : {};
      const updated = { ...scene.objects[index], ...input, id: parsedId.data };
      const parsedObject = sceneObjectSchema.safeParse(updated);
      if (!parsedObject.success) return invalidScene();
      const objects = [...scene.objects];
      objects[index] = parsedObject.data;
      const parsedScene = sceneDocumentSchema.safeParse({ ...scene, objects });
      if (!parsedScene.success) return invalidScene();
      repository.writeScene(parsedScene.data);
      return { ok: true, value: parsedObject.data };
    },

    delete(sceneId, objectId) {
      const { scene } = getScene(repository, sceneId);
      if (!scene) return { ok: false, status: 404, message: 'Scene tidak ditemukan' };
      const parsedId = sceneObjectIdSchema.safeParse(objectId);
      if (!parsedId.success) return invalidScene();
      const objects = scene.objects.filter(object => object.id !== parsedId.data);
      if (objects.length === scene.objects.length) {
        return { ok: false, status: 404, message: 'Objek tidak ditemukan' };
      }
      const parsedScene = sceneDocumentSchema.safeParse({ ...scene, objects });
      if (!parsedScene.success) return invalidScene();
      repository.writeScene(parsedScene.data);
      return { ok: true, value: `Objek "${parsedId.data}" berhasil dihapus` };
    },
  };
}
