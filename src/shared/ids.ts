import path from 'node:path';
import { InvalidFilePathError } from './app-error';

export const FILE_IDENTIFIER_PATTERN = /^[a-z0-9-]+$/;

export function assertFileIdentifier(value: unknown, label = 'identifier'): string {
  if (typeof value !== 'string' || !FILE_IDENTIFIER_PATTERN.test(value)) {
    throw new InvalidFilePathError(`${label} tidak valid`);
  }
  return value;
}

export function resolveWithin(baseDir: string, ...segments: string[]): string {
  const root = path.resolve(baseDir);
  const normalizedSegments = segments.map(segment => {
    if (typeof segment !== 'string' || segment.includes('\0')) {
      throw new InvalidFilePathError('Path tidak valid');
    }
    if (path.posix.isAbsolute(segment) || path.win32.isAbsolute(segment)) {
      throw new InvalidFilePathError('Path tidak valid');
    }
    return segment.replace(/\\/g, '/');
  });
  const resolved = path.resolve(root, ...normalizedSegments);
  const relative = path.relative(root, resolved);

  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new InvalidFilePathError('Path tidak valid');
  }
  return resolved;
}

export interface IdentifierPathOptions {
  id: unknown;
  prefix?: string;
  suffix?: string;
  label?: string;
}

export function resolveIdentifierPath(baseDir: string, options: IdentifierPathOptions): string {
  const {
    id,
    prefix = '',
    suffix = '',
    label = 'identifier',
  } = options;
  const safeId = assertFileIdentifier(id, label);
  return resolveWithin(baseDir, `${prefix}${safeId}${suffix}`);
}
