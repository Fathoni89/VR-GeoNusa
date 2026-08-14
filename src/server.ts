import { once } from 'node:events';
import type { Express } from 'express';
import type { AppLogger } from './shared/types';

export interface StartHttpServerOptions {
  app: Express;
  port: number;
  initializeDatabase(): Promise<void>;
  initializeMl(): Promise<unknown>;
  logger: AppLogger;
  databaseLabel: string;
  onMlError(error: unknown, logger: AppLogger): void;
}

export async function startHttpServer(options: StartHttpServerOptions) {
  await options.initializeDatabase();

  const server = options.app.listen(options.port);
  await once(server, 'listening');
  const address = server.address();
  const listeningPort = address && typeof address === 'object'
    ? address.port
    : options.port;

  options.logger.log('\nVR-GeoNusa Server v2.0 (MySQL + multi-sekolah + ML server-side)');
  options.logger.log(`   Portal: http://localhost:${listeningPort}`);
  options.logger.log(`   Admin:  http://localhost:${listeningPort}/admin`);
  options.logger.log(`   API:    http://localhost:${listeningPort}/api/scenes`);
  options.logger.log(`   DB:     ${options.databaseLabel}\n`);

  Promise.resolve()
    .then(() => options.initializeMl())
    .catch(error => options.onMlError(error, options.logger));

  return server;
}
