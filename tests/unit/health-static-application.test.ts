import express from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { createHealthRepository } from '../../src/modules/health/health.repository';
import { createHealthRouter } from '../../src/modules/health/health.router';
import { createHealthService } from '../../src/modules/health/health.service';
import { createTeamRepository } from '../../src/modules/team/team.repository';
import {
  createFrontendFallbackRouter,
  createStaticApplicationRouter,
} from '../../src/static-application';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..', '..');
const REQUIRED_FILES = [
  'src/modules/health/health.router.ts',
  'src/modules/health/health.schema.ts',
  'src/modules/health/health.service.ts',
  'src/modules/health/health.repository.ts',
  'src/static-application.ts',
] as const;

let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'vgn-health-static-'));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('health Fase 6I', () => {
  test('health dan static application sudah keluar dari compatibility bootstrap', () => {
    for (const relativePath of REQUIRED_FILES) {
      expect(fs.existsSync(path.join(PROJECT_ROOT, relativePath)), relativePath).toBe(true);
    }
    const source = fs.readFileSync(path.join(PROJECT_ROOT, 'server.js'), 'utf8');
    expect(source).not.toContain("app.get('/api/health'");
    expect(source).not.toContain('app.use(express.static(');
    expect(source).not.toContain("app.get('*'");
  });

  test('liveness tidak membaca database atau membocorkan daftar file', async () => {
    let queries = 0;
    const repository = createHealthRepository(() => ({
      async query() {
        queries += 1;
        throw new Error('tidak boleh dipanggil');
      },
    }));
    const service = createHealthService(
      repository,
      () => false,
      () => new Date('2026-08-21T09:00:00.000Z'),
    );
    const app = express().use('/api/health', createHealthRouter(service));
    const response = await request(app).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      message: 'VR-GeoNusa server running',
      version: '2.0.0',
      status: 'live',
      timestamp: '2026-08-21T09:00:00.000Z',
    });
    expect(response.body).not.toHaveProperty('scenes');
    expect(response.body).not.toHaveProperty('db');
    expect(queries).toBe(0);
  });

  test('readiness database dan ML terpisah dengan status 503 terkontrol', async () => {
    let databaseAvailable = true;
    let mlReady = false;
    const repository = createHealthRepository(() => ({
      async query() {
        if (!databaseAvailable) throw new Error('database down');
        return [[{ ok: 1 }]];
      },
    }));
    const service = createHealthService(
      repository,
      () => mlReady,
      () => new Date('2026-08-21T09:00:00.000Z'),
    );
    const app = express().use('/api/health', createHealthRouter(service));

    expect((await request(app).get('/api/health/readiness/database')).body).toMatchObject({
      success: true,
      status: 'ready',
      component: 'database',
    });
    databaseAvailable = false;
    expect((await request(app).get('/api/health/readiness/database')).status).toBe(503);
    expect((await request(app).get('/api/health/readiness/ml')).body).toMatchObject({
      success: false,
      status: 'unavailable',
      component: 'ml',
    });
    mlReady = true;
    expect((await request(app).get('/api/health/readiness/ml')).status).toBe(200);
  });
});

describe('static application Fase 6I', () => {
  test('data kanonik menang atas public/data setelah suntingan repository', async () => {
    const dataDir = path.join(root, 'data');
    const publicDir = path.join(root, 'public');
    const publicTeamFile = path.join(publicDir, 'data', 'team.json');
    fs.mkdirSync(path.join(publicDir, 'admin'), { recursive: true });
    fs.writeFileSync(path.join(publicDir, 'index.html'), '<h1>Portal</h1>');
    fs.writeFileSync(path.join(publicDir, 'admin', 'index.html'), '<h1>Admin</h1>');

    const repository = createTeamRepository({
      teamFile: path.join(dataDir, 'team.json'),
      publicTeamFile,
      teamImageDir: path.join(publicDir, 'assets', 'images', 'team'),
    });
    repository.write([{ id: 'versi-baru', name: 'Versi Baru' }]);
    fs.writeFileSync(publicTeamFile, JSON.stringify([{ id: 'versi-lama', name: 'Versi Lama' }]));

    const app = express();
    app.use(createStaticApplicationRouter({ rootDir: root, dataDir, publicDir }));
    app.use(createFrontendFallbackRouter(publicDir));
    const response = await request(app).get('/data/team.json');

    expect(response.status).toBe(200);
    expect(response.body).toEqual([{ id: 'versi-baru', name: 'Versi Baru' }]);
  });

  test('halaman admin dan frontend fallback mempertahankan response lama', async () => {
    const dataDir = path.join(root, 'data');
    const publicDir = path.join(root, 'public');
    fs.mkdirSync(path.join(publicDir, 'admin'), { recursive: true });
    fs.writeFileSync(path.join(publicDir, 'index.html'), '<h1>Portal</h1>');
    fs.writeFileSync(path.join(publicDir, 'admin', 'index.html'), '<h1>Admin</h1>');

    const app = express();
    app.use(createStaticApplicationRouter({ rootDir: root, dataDir, publicDir }));
    app.use(createFrontendFallbackRouter(publicDir));

    expect((await request(app).get('/admin')).text).toContain('Admin');
    expect((await request(app).get('/route-tidak-ada')).text).toContain('Portal');
    expect((await request(app).get('/..%5Cserver.js')).text).toContain('Portal');
  });
});
