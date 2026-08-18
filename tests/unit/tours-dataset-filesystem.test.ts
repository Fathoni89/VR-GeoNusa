import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { createDatasetRepository } from '../../src/modules/dataset/dataset.repository';
import { collectBoundedStream } from '../../src/modules/dataset/dataset.router';
import { createDatasetService } from '../../src/modules/dataset/dataset.service';
import { detectImageType, selectDatasetSplit } from '../../src/modules/dataset/dataset.schema';
import { createToursRepository } from '../../src/modules/tours/tours.repository';
import { createToursService } from '../../src/modules/tours/tours.service';

let root: string;
let dataDir: string;
let publicDataDir: string;
let datasetDir: string;

const taxonomy = {
  _version: '0.1.0',
  split_ratio: { train: 0.7, val: 0.2, test: 0.1 },
  classes: [{
    class_id: 'balok',
    label_id: 'Balok',
    label_en: 'Rectangular Prism',
    sisi: 6,
    rusuk: 12,
    titik: 8,
    volume: 'p x l x t',
    luas: '2(pl + pt + lt)',
  }],
};

const tour = {
  tour_id: 'borobudur-360',
  name: 'Tur Fixture',
  source: 'Fixture',
  folder_order: ['Tambahan Halaman'],
  nodes: [{
    id: 'tambahan-halaman-00',
    folder: 'Tambahan Halaman',
    image: '/assets/panorama/tambahan-halaman-00.jpg',
  }],
};

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'vgn-tour-dataset-'));
  dataDir = path.join(root, 'data');
  publicDataDir = path.join(root, 'public', 'data');
  datasetDir = path.join(root, 'Dataset', 'geometry_wbn');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'geometry-labels.json'), JSON.stringify(taxonomy));
  fs.writeFileSync(path.join(dataDir, 'tour-borobudur.json'), JSON.stringify(tour));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

function services() {
  const toursRepository = createToursRepository({ dataDir, publicDataDir });
  const datasetRepository = createDatasetRepository({
    datasetDir,
    createId: () => '11111111-1111-4111-8111-111111111111',
    now: () => new Date('2026-08-16T10:00:00.000Z'),
  });
  return {
    toursRepository,
    tours: createToursService(toursRepository),
    dataset: createDatasetService(datasetRepository, toursRepository),
  };
}

describe('tour terverifikasi', () => {
  test('listing memakai ID filename dan update tidak menyimpan prediksi sebagai identify', () => {
    const { toursRepository, tours } = services();
    expect(tours.list()).toEqual([{
      tour_id: 'borobudur',
      name: 'Tur Fixture',
      source: 'Fixture',
      node_count: 1,
      identified_count: 0,
      area_count: 1,
    }]);

    const result = tours.updateFolder('borobudur', 'Tambahan Halaman', {
      class_id: 'balok',
      element: 'Badan candi',
      predicted_class_id: 'kerucut',
      confidence: 0.99,
    });

    expect(result).toMatchObject({ ok: true, value: { appliedTo: 1 } });
    const identify = toursRepository.read('borobudur')?.nodes[0]?.identify;
    expect(identify).toMatchObject({ class_id: 'balok', element: 'Badan candi' });
    expect(identify).not.toHaveProperty('predicted_class_id');
    expect(identify).not.toHaveProperty('confidence');
    expect(fs.readFileSync(path.join(publicDataDir, 'tour-borobudur.json'), 'utf8'))
      .toBe(fs.readFileSync(path.join(dataDir, 'tour-borobudur.json'), 'utf8'));
  });
});

describe('upload dataset dengan provenance', () => {
  test('mendeteksi MIME dari signature, bukan header semata', () => {
    expect(detectImageType(Buffer.from([0xff, 0xd8, 0xff, 0x00]))).toEqual({
      mimeType: 'image/jpeg',
      extension: 'jpg',
    });
    expect(detectImageType(Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]))).toEqual({ mimeType: 'image/png', extension: 'png' });
    expect(detectImageType(Buffer.from('bukan gambar'))).toBeNull();
  });

  test('source yang sama selalu berada pada split yang sama', () => {
    const ratios = taxonomy.split_ratio;
    const first = selectDatasetSplit('borobudur:tambahan-halaman-00', ratios);
    expect(selectDatasetSplit('borobudur:tambahan-halaman-00', ratios)).toBe(first);

    const observed = new Set(
      Array.from({ length: 500 }, (_, index) => selectDatasetSplit(`tour:node-${index}`, ratios)),
    );
    expect(observed).toEqual(new Set(['train', 'val', 'test']));
  });

  test('menulis UUID dan sidecar provenance pada split source', () => {
    const { dataset } = services();
    const image = Buffer.from([0xff, 0xd8, 0xff, 0x00]);
    const result = dataset.upload({
      classId: 'balok',
      contentType: 'image/jpeg',
      image,
      provenance: {
        tourId: 'borobudur',
        nodeId: 'tambahan-halaman-00',
        taxonomyVersion: '0.1.0',
      },
    });

    expect(result).toMatchObject({
      ok: true,
      value: {
        filename: 'balok_11111111-1111-4111-8111-111111111111.jpg',
        classId: 'balok',
        total: 1,
      },
    });
    if (!result.ok) throw new Error('Upload fixture gagal');

    const split = selectDatasetSplit(
      'borobudur:tambahan-halaman-00',
      taxonomy.split_ratio,
    );
    const classDir = path.join(datasetDir, split, 'balok');
    const metadata = JSON.parse(
      fs.readFileSync(path.join(classDir, `${result.value.filename}.metadata.json`), 'utf8'),
    ) as Record<string, unknown>;
    expect(fs.readFileSync(path.join(classDir, result.value.filename))).toEqual(image);
    expect(metadata).toMatchObject({
      schema_version: 1,
      source_id: 'borobudur:tambahan-halaman-00',
      tour_id: 'borobudur',
      node_id: 'tambahan-halaman-00',
      panorama: '/assets/panorama/tambahan-halaman-00.jpg',
      taxonomy_version: '0.1.0',
      split,
      mime_type: 'image/jpeg',
      created_at: '2026-08-16T10:00:00.000Z',
    });
    expect(metadata.image_sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  test('menolak taxonomy, node, dan MIME yang tidak terverifikasi tanpa menulis file', () => {
    const { dataset } = services();
    const baseline = {
      classId: 'balok',
      contentType: 'image/jpeg',
      image: Buffer.from([0xff, 0xd8, 0xff, 0x00]),
      provenance: {
        tourId: 'borobudur',
        nodeId: 'tambahan-halaman-00',
        taxonomyVersion: '0.1.0',
      },
    };

    expect(dataset.upload({
      ...baseline,
      provenance: { ...baseline.provenance, taxonomyVersion: '0.0.9' },
    })).toMatchObject({ ok: false, status: 400 });
    expect(dataset.upload({
      ...baseline,
      provenance: { ...baseline.provenance, nodeId: 'node-tidak-ada' },
    })).toMatchObject({ ok: false, status: 400 });
    expect(dataset.upload({ ...baseline, contentType: 'image/png' }))
      .toMatchObject({ ok: false, status: 415 });
    expect(dataset.upload({ ...baseline, image: Buffer.from('bukan gambar') }))
      .toMatchObject({ ok: false, status: 415 });
    expect(fs.existsSync(datasetDir)).toBe(false);
  });

  test('statistik hanya menghitung image, bukan sidecar metadata', () => {
    const { dataset } = services();
    dataset.upload({
      classId: 'balok',
      contentType: 'image/jpeg',
      image: Buffer.from([0xff, 0xd8, 0xff, 0x00]),
      provenance: {
        tourId: 'borobudur',
        nodeId: 'tambahan-halaman-00',
        taxonomyVersion: '0.1.0',
      },
    });
    expect(dataset.stats()).toEqual([expect.objectContaining({ class_id: 'balok', total: 1 })]);
  });

  test('exclusive create mencegah UUID collision menimpa image yang sudah ada', () => {
    const { dataset } = services();
    const input = {
      classId: 'balok',
      contentType: 'image/jpeg',
      image: Buffer.from([0xff, 0xd8, 0xff, 0x00]),
      provenance: {
        tourId: 'borobudur',
        nodeId: 'tambahan-halaman-00',
        taxonomyVersion: '0.1.0',
      },
    };
    const first = dataset.upload(input);
    expect(first.ok).toBe(true);
    expect(() => dataset.upload({
      ...input,
      image: Buffer.from([0xff, 0xd8, 0xff, 0x01]),
    })).toThrow();

    const split = selectDatasetSplit(
      'borobudur:tambahan-halaman-00',
      taxonomy.split_ratio,
    );
    const imagePath = path.join(
      datasetDir,
      split,
      'balok',
      'balok_11111111-1111-4111-8111-111111111111.jpg',
    );
    expect(fs.readFileSync(imagePath)).toEqual(input.image);
  });
});

test('stream oversized dihentikan tanpa menggabungkan seluruh body', async () => {
  const stream = Readable.from([Buffer.alloc(4), Buffer.alloc(4), Buffer.alloc(4)]);
  const result = await collectBoundedStream(stream, 6);
  expect(result).toEqual({ ok: false, tooLarge: true });
});
