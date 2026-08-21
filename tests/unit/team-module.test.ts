import express, { type RequestHandler } from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { createTeamRepository } from '../../src/modules/team/team.repository';
import { createTeamRouter } from '../../src/modules/team/team.router';
import { createTeamService } from '../../src/modules/team/team.service';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..', '..');
const REQUIRED_MODULES = [
  'src/modules/team/team.router.ts',
  'src/modules/team/team.schema.ts',
  'src/modules/team/team.service.ts',
  'src/modules/team/team.repository.ts',
] as const;

let root: string;
let teamFile: string;
let publicTeamFile: string;
let teamImageDir: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'vgn-team-'));
  teamFile = path.join(root, 'data', 'team.json');
  publicTeamFile = path.join(root, 'public', 'data', 'team.json');
  teamImageDir = path.join(root, 'public', 'assets', 'images', 'team');
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

function createFixture() {
  const repository = createTeamRepository(
    { teamFile, publicTeamFile, teamImageDir },
  );
  repository.write([
    { id: 'anggota-satu', name: 'Anggota Satu', order: 1, photo: '' },
    { id: 'anggota-dua', name: 'Anggota Dua', order: 2, photo: '' },
  ]);
  const service = createTeamService(repository);
  const requireAuth: RequestHandler = (incoming, response, next) => {
    if (!incoming.get('X-Test-Auth')) {
      response.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }
    next();
  };
  const requireSuperAdmin: RequestHandler = (incoming, response, next) => {
    if (incoming.get('X-Test-Role') !== 'super_admin') {
      response.status(403).json({ success: false, message: 'Forbidden' });
      return;
    }
    next();
  };
  const app = express();
  app.use(express.json());
  app.use('/api/team', createTeamRouter({ service, requireAuth, requireSuperAdmin }));
  return { app, repository };
}

function asSuperAdmin<T extends { set(name: string, value: string): T }>(operation: T): T {
  return operation.set('X-Test-Auth', 'yes').set('X-Test-Role', 'super_admin');
}

describe('module team Fase 6H', () => {
  test('router, schema, service, dan repository tersedia tanpa route legacy', () => {
    for (const relativePath of REQUIRED_MODULES) {
      expect(fs.existsSync(path.join(PROJECT_ROOT, relativePath)), relativePath).toBe(true);
    }
    const source = fs.readFileSync(path.join(PROJECT_ROOT, 'server.js'), 'utf8');
    for (const declaration of [
      'function readTeam(',
      'function writeTeam(',
      "app.get('/api/team'",
      "app.post('/api/team'",
      "app.put('/api/team/:id'",
      "app.delete('/api/team/:id'",
      "app.patch('/api/team/reorder'",
      "app.post('/api/team/:id/photo'",
    ]) {
      expect(source, declaration).not.toContain(declaration);
    }
  });

  test('GET tetap publik dan semua mutasi memerlukan super_admin', async () => {
    const { app } = createFixture();
    expect((await request(app).get('/api/team')).status).toBe(200);
    expect((await request(app).post('/api/team').send({ id: 'baru', name: 'Baru' })).status)
      .toBe(401);
    expect((await request(app)
      .post('/api/team')
      .set('X-Test-Auth', 'yes')
      .set('X-Test-Role', 'teacher')
      .send({ id: 'baru', name: 'Baru' })).status).toBe(403);
  });

  test('CRUD mempertahankan kontrak response dan sinkronisasi JSON publik', async () => {
    const { app } = createFixture();
    const created = await asSuperAdmin(request(app).post('/api/team'))
      .send({ id: 'anggota-baru', name: 'Anggota Baru' });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      success: true,
      data: { id: 'anggota-baru', name: 'Anggota Baru', order: 3 },
    });

    const duplicate = await asSuperAdmin(request(app).post('/api/team'))
      .send({ id: 'anggota-baru', name: 'Duplikat' });
    expect(duplicate.status).toBe(409);

    const updated = await asSuperAdmin(request(app).put('/api/team/anggota-baru'))
      .send({ id: 'id-tidak-boleh-berubah', name: 'Nama Baru' });
    expect(updated.body.data).toMatchObject({ id: 'anggota-baru', name: 'Nama Baru' });

    const deleted = await asSuperAdmin(request(app).delete('/api/team/anggota-baru'));
    expect(deleted.body).toEqual({
      success: true,
      message: 'Anggota "anggota-baru" dihapus',
    });
    expect(fs.readFileSync(teamFile, 'utf8')).toBe(fs.readFileSync(publicTeamFile, 'utf8'));
    expect(fs.readdirSync(path.dirname(teamFile))).not.toEqual(
      expect.arrayContaining([expect.stringMatching(/\.tmp$/)]),
    );
  });

  test('reorder menerima daftar lengkap dan menolak ID hilang atau duplikat', async () => {
    const { app } = createFixture();
    const reordered = await asSuperAdmin(request(app).patch('/api/team/reorder'))
      .send({ order: ['anggota-dua', 'anggota-satu'] });
    expect(reordered.status).toBe(200);
    expect(reordered.body.data).toMatchObject([
      { id: 'anggota-dua', order: 1 },
      { id: 'anggota-satu', order: 2 },
    ]);

    const incomplete = await asSuperAdmin(request(app).patch('/api/team/reorder'))
      .send({ order: ['anggota-satu'] });
    expect(incomplete.status).toBe(400);
  });

  test('upload divalidasi Sharp, ditulis atomik, dan tidak menghapus foto lama', async () => {
    const { app, repository } = createFixture();
    fs.mkdirSync(teamImageDir, { recursive: true });
    const oldPhoto = path.join(teamImageDir, 'anggota-satu.jpg');
    fs.writeFileSync(oldPhoto, 'foto lama');

    const invalid = await asSuperAdmin(request(app).post('/api/team/anggota-satu/photo'))
      .set('Content-Type', 'image/jpeg')
      .send(Buffer.from('bukan gambar'));
    expect(invalid.status).toBe(415);

    const image = await sharp({
      create: { width: 2, height: 2, channels: 3, background: '#ffffff' },
    }).png().toBuffer();
    const uploaded = await asSuperAdmin(request(app).post('/api/team/anggota-satu/photo'))
      .set('Content-Type', 'image/png')
      .send(image);
    const digest = crypto.createHash('sha256').update(image).digest('hex');
    const expectedPhoto = `/assets/images/team/anggota-satu-${digest}.png`;
    expect(uploaded.body).toEqual({ success: true, photo: expectedPhoto });
    expect(fs.readFileSync(path.join(teamImageDir, path.basename(expectedPhoto)))).toEqual(image);
    expect(repository.read()[0]?.photo).toBe(expectedPhoto);
    expect(fs.existsSync(oldPhoto)).toBe(true);
  });

  test('upload berhenti pada batas 3MB sebelum validasi gambar', async () => {
    const { app } = createFixture();
    const response = await asSuperAdmin(request(app).post('/api/team/anggota-satu/photo'))
      .set('Content-Type', 'image/jpeg')
      .send(Buffer.alloc(3 * 1024 * 1024 + 1));
    expect(response.status).toBe(413);
    expect(response.body).toEqual({ success: false, message: 'Foto maksimal 3MB' });
  });
});
