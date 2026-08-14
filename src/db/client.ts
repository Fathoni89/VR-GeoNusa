import mysql, { type Pool, type PoolOptions } from 'mysql2/promise';
import type { AppEnv } from '../config/env';

export type PoolFactory = (options: PoolOptions) => Pool;

export function createDatabasePool(
  env: AppEnv,
  poolFactory: PoolFactory = mysql.createPool
): Pool {
  return poolFactory({
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    multipleStatements: true,
  });
}
