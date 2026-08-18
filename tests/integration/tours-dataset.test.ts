import express from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { createDatasetRepository } from '../../src/modules/dataset/dataset.repository';
import { createDatasetRouter, MAX_DATASET_IMAGE_BYTES } from '../../src/modules/dataset/dataset.router';
import { createDatasetService } from '../../src/modules/dataset/dataset.service';
import { errorHandler } from '../../src/middleware/error-handler';
import { createToursRepository } from '../../src/modules/tours/tours.repository';
import { createToursRouter } from '../../src/modules/tours/tours.router';
import { createToursService } from '../../src/modules/tours/tours.service';

let root: string;
let dataDir: string;
let publicDataDir: string;
let datasetDir: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'vgn-tour-dataset-http-'));
  dataDir = path.join(root, 'data');
  publicDataDir = path.join(root, 'public', 'data');
  datasetDir = path.join(root, 'Dataset', 'geometry_wbn');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'geometry-labels.json'), JSON.stringify({
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
  }));
  fs.writeFileSync(path.join(dataDir, 'tour-borobudur.json'), JSON.stringify({
    tour_id: 'borobudur-360',
    name: 'Tur Fixture',
    folder_order: ['Tambahan Halaman'],
    nodes: [{
      id: 'tambahan-halaman-00',
      folder: 'Tambahan Halaman',
      image: '/assets/panorama/tambahan-halaman-00.jpg',
    }],
  }));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

function createTestApp() {
  const app = express();
  app.locals.logger = { log() {}, error() {} };
  app.use(express.json());
  const toursRepository = createToursRepository({ dataDir, publicDataDir });
  const allow = (_request: express.Request, _response: express.Response, next: express.NextFunction) => next();
  app.use('/api', createToursRouter({
    service: createToursService(toursRepository),
    requireAuth: allow,
    requireSuperAdmin: allow,
  }));
  app.use('/api/dataset', createDatasetRouter({
    service: createDatasetService(
      createDatasetRepository({ datasetDir }),
      toursRepository,
    ),
    requireAuth: allow,
    requireSuperAdmin: allow,
  }));
  app.use(errorHandler);
  return app;
}

function provenance(requestBuilder: request.Test): request.Test {
  return requestBuilder
    .set('X-Dataset-Tour-Id', 'borobudur')
    .set('X-Dataset-Node-Id', 'tambahan-halaman-00')
    .set('X-Taxonomy-Version', '0.1.0');
}

describe('kontrak HTTP tours', () => {
  test('listing mempertahankan response dan folder dengan spasi tetap dapat diubah', async () => {
    const app = createTestApp();
    const listing = await request(app).get('/api/tours');
    expect(listing.status).toBe(200);
    expect(listing.body).toEqual({
      success: true,
      data: [expect.objectContaining({ tour_id: 'borobudur', node_count: 1 })],
    });

    const update = await request(app)
      .put('/api/tour/borobudur/folder/Tambahan%20Halaman')
      .send({ class_id: null });
    expect(update.status).toBe(200);
    expect(update.body).toEqual({
      success: true,
      folder: 'Tambahan Halaman',
      applied_to: 1,
      identify: null,
    });
  });
});

describe('kontrak HTTP upload dataset', () => {
  test('upload valid mempertahankan response lama dan memakai filename UUID', async () => {
    const response = await provenance(
      request(createTestApp())
        .post('/api/dataset/balok')
        .set('Content-Type', 'image/jpeg'),
    ).send(Buffer.from([0xff, 0xd8, 0xff, 0x00]));

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      success: true,
      filename: expect.stringMatching(
        /^balok_[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\.jpg$/,
      ),
      class_id: 'balok',
      total: 1,
    });
  });

  test('provenance wajib dan MIME palsu ditolak tanpa file', async () => {
    const app = createTestApp();
    const missing = await request(app)
      .post('/api/dataset/balok')
      .set('Content-Type', 'image/jpeg')
      .send(Buffer.from([0xff, 0xd8, 0xff, 0x00]));
    const spoofed = await provenance(
      request(app)
        .post('/api/dataset/balok')
        .set('Content-Type', 'image/png'),
    ).send(Buffer.from([0xff, 0xd8, 0xff, 0x00]));

    expect(missing.status).toBe(400);
    expect(spoofed.status).toBe(415);
    expect(fs.existsSync(datasetDir)).toBe(false);
  });

  test('batas 5MB berlaku pada stream dan identifier ditolak sebelum body', async () => {
    const app = createTestApp();
    const oversized = await provenance(
      request(app)
        .post('/api/dataset/balok')
        .set('Content-Type', 'image/jpeg'),
    ).send(Buffer.alloc(MAX_DATASET_IMAGE_BYTES + 1));
    const invalidIdentifier = await request(app)
      .post('/api/dataset/UPPER_CASE')
      .set('Content-Type', 'image/jpeg')
      .send(Buffer.from([0xff, 0xd8, 0xff, 0x00]));

    expect(oversized.status).toBe(413);
    expect(oversized.body).toEqual({ success: false, message: 'Gambar maksimal 5MB' });
    expect(invalidIdentifier.status).toBe(400);
    expect(fs.existsSync(datasetDir)).toBe(false);
  });
});
