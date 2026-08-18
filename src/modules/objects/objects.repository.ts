import type { SceneDocument } from '../scenes/scenes.schema';
import type { ScenesRepository } from '../scenes/scenes.repository';

export interface ObjectsRepository {
  readScene(sceneId: unknown): SceneDocument | null;
  writeScene(scene: SceneDocument): void;
}

export function createObjectsRepository(scenes: ScenesRepository): ObjectsRepository {
  return {
    readScene: sceneId => scenes.read(sceneId),
    writeScene: scene => scenes.write(scene),
  };
}
