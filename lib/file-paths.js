'use strict';

const path = require('path');

const FILE_IDENTIFIER_PATTERN = /^[a-z0-9-]+$/;

class InvalidFilePathError extends Error {
  constructor(message) {
    super(message);
    this.name = 'InvalidFilePathError';
    this.code = 'INVALID_FILE_PATH';
    this.statusCode = 400;
  }
}

function assertFileIdentifier(value, label = 'identifier') {
  if (typeof value !== 'string' || !FILE_IDENTIFIER_PATTERN.test(value)) {
    throw new InvalidFilePathError(`${label} tidak valid`);
  }
  return value;
}

function resolveWithin(baseDir, ...segments) {
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

function resolveIdentifierPath(baseDir, {
  id,
  prefix = '',
  suffix = '',
  label = 'identifier',
}) {
  const safeId = assertFileIdentifier(id, label);
  return resolveWithin(baseDir, `${prefix}${safeId}${suffix}`);
}

module.exports = {
  FILE_IDENTIFIER_PATTERN,
  InvalidFilePathError,
  assertFileIdentifier,
  resolveIdentifierPath,
  resolveWithin,
};
