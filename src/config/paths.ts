import path from 'node:path';

export interface AppPaths {
  rootDir: string;
  dataDir: string;
  publicDir: string;
  vrDir: string;
  configDir: string;
  datasetDir: string;
  schemaFile: string;
  teamFile: string;
  jwtSecretFile: string;
}

export function createPaths(rootDir: string): AppPaths {
  const canonicalRoot = path.resolve(rootDir);
  const dataDir = path.join(canonicalRoot, 'data');
  const publicDir = path.join(canonicalRoot, 'public');
  const configDir = path.join(canonicalRoot, 'config');

  return {
    rootDir: canonicalRoot,
    dataDir,
    publicDir,
    vrDir: path.join(publicDir, 'vr'),
    configDir,
    datasetDir: path.join(canonicalRoot, 'Dataset', 'geometry_wbn'),
    schemaFile: path.join(canonicalRoot, 'db', 'schema.mysql.sql'),
    teamFile: path.join(dataDir, 'team.json'),
    jwtSecretFile: path.join(configDir, 'jwt-secret.txt'),
  };
}
