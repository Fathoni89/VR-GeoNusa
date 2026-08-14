import { once } from 'node:events';
import { rmSync } from 'node:fs';
import path from 'node:path';
import type { Express } from 'express';

interface BuiltServerModule {
  app: Express;
}

type DatabaseQuery = (...parameters: unknown[]) => Promise<unknown>;

const projectRoot = path.resolve(__dirname, '..', '..', '..');
const distRoot = path.join(projectRoot, 'dist');
const generatedConfigDir = path.join(distRoot, 'config');

async function main(): Promise<void> {
  let server: ReturnType<Express['listen']> | undefined;

  try {
    process.env.NODE_ENV = 'test';
    const builtModule = require(path.join(distRoot, 'server.js')) as BuiltServerModule;
    const dbPool = builtModule.app.locals.dbPool as { query: DatabaseQuery };
    const originalQuery = dbPool.query;
    dbPool.query = async () => [[{ ok: 1 }]];

    try {
      server = builtModule.app.listen(0, '127.0.0.1');
      await once(server, 'listening');
      const address = server.address();
      if (!address || typeof address === 'string') {
        throw new Error('Alamat smoke server tidak valid');
      }

      const response = await fetch(`http://127.0.0.1:${address.port}/api/health`);
      const body = await response.json() as { success?: boolean };
      if (!response.ok || body.success !== true) {
        throw new Error(`Health build gagal dengan status ${response.status}`);
      }
    } finally {
      dbPool.query = originalQuery;
    }

    console.log('Health endpoint build berhasil.');
  } finally {
    if (server?.listening) {
      server.close();
      await once(server, 'close');
    }
    rmSync(generatedConfigDir, { recursive: true, force: true });
  }
}

void main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
