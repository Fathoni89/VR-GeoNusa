import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { createObjectsRepository } from '../../src/modules/objects/objects.repository';
import { createObjectsService } from '../../src/modules/objects/objects.service';
import { sceneDocumentSchema } from '../../src/modules/scenes/scenes.schema';
import { createScenesRepository } from '../../src/modules/scenes/scenes.repository';
import { createScenesService } from '../../src/modules/scenes/scenes.service';

let root: string;
let dataDir: string;
let publicDataDir: string;
let vrDir: string;

function fixtureScene() {
  return {
    scene_id: 'scene-test',
    name: 'Scene Test',
    location: 'Fixture',
    custom_legacy_field: { retained: true },
    objects: [{ id: 'obj-test', type: 'box', custom: 'tetap' }],
  };
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'vgn-scenes-'));
  dataDir = path.join(root, 'data');
  publicDataDir = path.join(root, 'public', 'data');
  vrDir = path.join(root, 'public', 'vr');
  fs.mkdirSync(dataDir, { recursive: true });
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('scene schema minimal kompatibel', () => {
  test('menerima field legacy dan scene aktif saat ini', () => {
    const current = JSON.parse(
      fs.readFileSync(path.resolve(import.meta.dirname, '..', '..', 'data', 'prambanan.json'), 'utf8'),
    ) as unknown;

    expect(sceneDocumentSchema.safeParse(current).success).toBe(true);
    const parsed = sceneDocumentSchema.parse(fixtureScene());
    expect(parsed.custom_legacy_field).toEqual({ retained: true });
    expect(parsed.objects[0].custom).toBe('tetap');
  });

  test.each([
    { scene_id: '../outside', name: 'Scene', objects: [] },
    { scene_id: 'scene-test', name: '', objects: [] },
    { scene_id: 'scene-test', name: 'Scene' },
    { scene_id: 'scene-test', name: 'Scene', objects: [{ id: 'BAD_ID' }] },
  ])('menolak struktur scene tidak valid', candidate => {
    expect(sceneDocumentSchema.safeParse(candidate).success).toBe(false);
  });
});

describe('atomic filesystem repository', () => {
  test('menyinkronkan JSON dan VR tanpa meninggalkan temporary file', () => {
    const repository = createScenesRepository({ dataDir, publicDataDir, vrDir });
    const scene = sceneDocumentSchema.parse(fixtureScene());

    repository.write(scene);
    repository.writeVr(scene.scene_id, '<html>fixture</html>');
    repository.write({ ...scene, name: 'Scene Diperbarui' });

    const backend = fs.readFileSync(path.join(dataDir, 'scene-test.json'), 'utf8');
    const publicCopy = fs.readFileSync(path.join(publicDataDir, 'scene-test.json'), 'utf8');
    expect(JSON.parse(backend)).toMatchObject({ name: 'Scene Diperbarui' });
    expect(publicCopy).toBe(backend);
    expect(fs.readFileSync(path.join(vrDir, 'scene-test.html'), 'utf8'))
      .toBe('<html>fixture</html>');

    const allFiles = fs.readdirSync(root, { recursive: true, encoding: 'utf8' });
    expect(allFiles.some(file => String(file).endsWith('.tmp'))).toBe(false);
  });

  test('menolak JSON tersimpan yang bukan scene valid', () => {
    fs.writeFileSync(
      path.join(dataDir, 'scene-test.json'),
      JSON.stringify({ scene_id: 'scene-test', name: 'Rusak', objects: [{ id: '../bad' }] }),
    );
    const repository = createScenesRepository({ dataDir, publicDataDir, vrDir });

    expect(() => repository.read('scene-test')).toThrow('Data scene tersimpan tidak valid');
  });

  test('listing melewati JSON konfigurasi non-scene', () => {
    fs.writeFileSync(path.join(dataDir, 'quiz.json'), JSON.stringify({ questions: [] }));
    const repository = createScenesRepository({ dataDir, publicDataDir, vrDir });
    repository.write(sceneDocumentSchema.parse(fixtureScene()));

    expect(repository.list().map(scene => scene.scene_id)).toEqual(['scene-test']);
  });
});

describe('scene dan object services', () => {
  test('CRUD mempertahankan field legacy dan sinkronisasi repository', () => {
    const repository = createScenesRepository({ dataDir, publicDataDir, vrDir });
    const scenes = createScenesService(repository, { render: scene => `<html>${scene.name}</html>` });
    const objects = createObjectsService(createObjectsRepository(repository));

    const created = scenes.create({ scene_id: 'scene-new', name: 'Scene Baru', legacy: true });
    expect(created).toMatchObject({
      ok: true,
      value: { scene: { scene_id: 'scene-new', name: 'Scene Baru', objects: [] } },
    });

    const objectCreated = objects.create('scene-new', { id: 'obj-new', type: 'box', legacy: true });
    const objectUpdated = objects.update('scene-new', 'obj-new', { color: '#fff', id: 'diabaikan' });
    expect(objectCreated).toMatchObject({ ok: true, value: { id: 'obj-new', legacy: true } });
    expect(objectUpdated).toMatchObject({ ok: true, value: { id: 'obj-new', color: '#fff' } });
    expect(repository.read('scene-new')?.objects[0]).toMatchObject({ id: 'obj-new', legacy: true });

    expect(objects.delete('scene-new', 'obj-new')).toEqual({
      ok: true,
      value: 'Objek "obj-new" berhasil dihapus',
    });
    expect(scenes.delete('scene-new')).toEqual({
      ok: true,
      value: 'Scene "scene-new" berhasil dihapus',
    });
    expect(repository.read('scene-new')).toBeNull();
  });

  test('validasi write menolak scene dan object tidak aman', () => {
    const repository = createScenesRepository({ dataDir, publicDataDir, vrDir });
    const scenes = createScenesService(repository, { render: () => '<html></html>' });
    const objects = createObjectsService(createObjectsRepository(repository));
    expect(scenes.create({ scene_id: 'scene-new', name: 123 })).toEqual({
      ok: false,
      status: 400,
      message: 'Data scene tidak valid',
    });
    scenes.create({ scene_id: 'scene-new', name: 'Scene Baru' });
    expect(objects.create('scene-new', { id: 'BAD_ID' })).toEqual({
      ok: false,
      status: 400,
      message: 'Data scene tidak valid',
    });
    expect(fs.existsSync(path.join(dataDir, 'BAD_ID.json'))).toBe(false);
  });
});
