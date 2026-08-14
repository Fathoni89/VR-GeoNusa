import { cpSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(__dirname, '..', '..', '..');
const distRoot = path.join(projectRoot, 'dist');
const runtimeDirectories = ['data', 'db', 'public'] as const;

mkdirSync(distRoot, { recursive: true });

for (const directory of runtimeDirectories) {
  const source = path.join(projectRoot, directory);
  if (!existsSync(source)) {
    throw new Error(`Asset runtime tidak ditemukan: ${directory}`);
  }
  cpSync(source, path.join(distRoot, directory), { recursive: true });
}

console.log('Asset runtime tersalin ke dist.');
