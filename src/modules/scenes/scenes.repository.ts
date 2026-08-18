import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { resolveIdentifierPath, resolveWithin } from '../../shared/ids';
import { parseStoredScene, sceneDocumentSchema, type SceneDocument } from './scenes.schema';

export interface SceneFilesystemPaths {
  dataDir: string;
  publicDataDir: string;
  vrDir: string;
}

export interface ScenesRepository {
  list(): SceneDocument[];
  read(sceneId: unknown): SceneDocument | null;
  write(scene: SceneDocument): void;
  writeVr(sceneId: unknown, html: string): void;
  delete(sceneId: unknown): boolean;
}

function atomicWriteFile(targetPath: string, content: string): void {
  const directory = path.dirname(targetPath);
  fs.mkdirSync(directory, { recursive: true });
  const temporaryName = `.${path.basename(targetPath)}.${crypto.randomUUID()}.tmp`;
  const temporaryPath = resolveWithin(directory, temporaryName);
  try {
    fs.writeFileSync(temporaryPath, content, { encoding: 'utf8', flag: 'wx' });
    fs.renameSync(temporaryPath, targetPath);
  } catch (error) {
    if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath);
    throw error;
  }
}

function sceneFile(directory: string, sceneId: unknown): string {
  return resolveIdentifierPath(directory, {
    id: sceneId,
    suffix: '.json',
    label: 'scene_id',
  });
}

function vrFile(directory: string, sceneId: unknown): string {
  return resolveIdentifierPath(directory, {
    id: sceneId,
    suffix: '.html',
    label: 'scene_id',
  });
}

export function createScenesRepository(paths: SceneFilesystemPaths): ScenesRepository {
  return {
    list() {
      return fs.readdirSync(paths.dataDir)
        .filter(file => file.endsWith('.json'))
        .map(file => JSON.parse(fs.readFileSync(resolveWithin(paths.dataDir, file), 'utf8')) as unknown)
        .map(value => sceneDocumentSchema.safeParse(value))
        .filter(result => result.success)
        .map(result => result.data);
    },

    read(sceneId) {
      const file = sceneFile(paths.dataDir, sceneId);
      if (!fs.existsSync(file)) return null;
      return parseStoredScene(JSON.parse(fs.readFileSync(file, 'utf8')) as unknown);
    },

    write(scene) {
      const validated = parseStoredScene(scene);
      const json = JSON.stringify(validated, null, 2);
      atomicWriteFile(sceneFile(paths.dataDir, validated.scene_id), json);
      atomicWriteFile(sceneFile(paths.publicDataDir, validated.scene_id), json);
    },

    writeVr(sceneId, html) {
      atomicWriteFile(vrFile(paths.vrDir, sceneId), html);
    },

    delete(sceneId) {
      const source = sceneFile(paths.dataDir, sceneId);
      if (!fs.existsSync(source)) return false;
      fs.unlinkSync(source);
      const publicCopy = sceneFile(paths.publicDataDir, sceneId);
      if (fs.existsSync(publicCopy)) fs.unlinkSync(publicCopy);
      const vrPage = vrFile(paths.vrDir, sceneId);
      if (fs.existsSync(vrPage)) fs.unlinkSync(vrPage);
      return true;
    },
  };
}
