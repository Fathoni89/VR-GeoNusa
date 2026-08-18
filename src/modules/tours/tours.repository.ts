import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { assertFileIdentifier, resolveIdentifierPath, resolveWithin } from '../../shared/ids';
import {
  parseStoredTaxonomy,
  parseStoredTour,
  type GeometryTaxonomy,
  type TourDocument,
} from './tours.schema';

export interface TourFilesystemPaths {
  dataDir: string;
  publicDataDir: string;
}

export interface ToursRepository {
  listIds(): string[];
  read(tourId: unknown): TourDocument | null;
  write(tourId: unknown, tour: TourDocument): void;
  readTaxonomy(): GeometryTaxonomy;
}

function tourFile(directory: string, tourId: unknown): string {
  return resolveIdentifierPath(directory, {
    id: tourId,
    prefix: 'tour-',
    suffix: '.json',
    label: 'tour_id',
  });
}

function atomicWriteFile(targetPath: string, content: string): void {
  const directory = path.dirname(targetPath);
  fs.mkdirSync(directory, { recursive: true });
  const temporaryPath = resolveWithin(
    directory,
    `.${path.basename(targetPath)}.${crypto.randomUUID()}.tmp`,
  );
  try {
    fs.writeFileSync(temporaryPath, content, { encoding: 'utf8', flag: 'wx' });
    fs.renameSync(temporaryPath, targetPath);
  } catch (error) {
    if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath);
    throw error;
  }
}

export function createToursRepository(paths: TourFilesystemPaths): ToursRepository {
  return {
    listIds() {
      if (!fs.existsSync(paths.dataDir)) return [];
      return fs.readdirSync(paths.dataDir)
        .map(file => /^tour-([a-z0-9-]+)\.json$/.exec(file)?.[1] ?? null)
        .filter((tourId): tourId is string => tourId !== null);
    },

    read(tourId) {
      const file = tourFile(paths.dataDir, tourId);
      if (!fs.existsSync(file)) return null;
      return parseStoredTour(JSON.parse(fs.readFileSync(file, 'utf8')) as unknown);
    },

    write(tourId, tour) {
      const id = assertFileIdentifier(tourId, 'tour_id');
      const validated = parseStoredTour(tour);
      const json = JSON.stringify(validated, null, 2);
      atomicWriteFile(tourFile(paths.dataDir, id), json);
      atomicWriteFile(tourFile(paths.publicDataDir, id), json);
    },

    readTaxonomy() {
      const file = resolveWithin(paths.dataDir, 'geometry-labels.json');
      return parseStoredTaxonomy(JSON.parse(fs.readFileSync(file, 'utf8')) as unknown);
    },
  };
}
