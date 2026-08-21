import express, { Router } from 'express';
import path from 'node:path';

export interface StaticApplicationPaths {
  rootDir: string;
  dataDir: string;
  publicDir: string;
}

export function createStaticApplicationRouter(paths: StaticApplicationPaths): Router {
  const router = Router();

  router.use('/data', express.static(paths.dataDir));
  router.get('/', (_request, response) => {
    response.sendFile(path.join(paths.publicDir, 'index.html'));
  });
  router.get('/admin', (_request, response) => {
    response.sendFile(path.join(paths.publicDir, 'admin', 'index.html'));
  });
  router.get('/admin/login', (_request, response) => {
    response.sendFile(path.join(paths.publicDir, 'admin', 'index.html'));
  });
  router.get('/api/ml-placeholder.json', (_request, response) => {
    response.sendFile(path.join(paths.rootDir, 'api', 'ml-placeholder.json'));
  });
  router.use(express.static(paths.publicDir, { index: false }));
  router.use('/assets', express.static(path.join(paths.rootDir, 'assets')));

  return router;
}

export function createFrontendFallbackRouter(publicDir: string): Router {
  const router = Router();
  router.get('*', (_request, response) => {
    response.sendFile(path.join(publicDir, 'index.html'));
  });
  return router;
}
