import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { assertFileIdentifier, resolveWithin } from '../../shared/ids';
import { parseStoredTeam, type TeamMember } from './team.schema';

export interface TeamFilesystemPaths {
  teamFile: string;
  publicTeamFile: string;
  teamImageDir: string;
}

export interface TeamRepository {
  read(): TeamMember[];
  write(team: TeamMember[]): void;
  writePhoto(teamId: unknown, extension: TeamPhotoExtension, image: Buffer): string;
}

export type TeamPhotoExtension = 'jpg' | 'png' | 'webp';

function atomicWriteFile(targetPath: string, content: string | Buffer): void {
  const directory = path.dirname(targetPath);
  fs.mkdirSync(directory, { recursive: true });
  const temporaryPath = resolveWithin(
    directory,
    `.${path.basename(targetPath)}.${crypto.randomUUID()}.tmp`,
  );
  try {
    fs.writeFileSync(temporaryPath, content, { flag: 'wx' });
    fs.renameSync(temporaryPath, targetPath);
  } catch (error) {
    if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath);
    throw error;
  }
}

export function createTeamRepository(
  paths: TeamFilesystemPaths,
): TeamRepository {
  return {
    read() {
      if (!fs.existsSync(paths.teamFile)) return [];
      return parseStoredTeam(JSON.parse(fs.readFileSync(paths.teamFile, 'utf8')) as unknown);
    },

    write(team) {
      const json = JSON.stringify(parseStoredTeam(team), null, 2);
      atomicWriteFile(paths.teamFile, json);
      atomicWriteFile(paths.publicTeamFile, json);
    },

    writePhoto(teamId, extension, image) {
      const id = assertFileIdentifier(teamId, 'team_id');
      const digest = crypto.createHash('sha256').update(image).digest('hex');
      const filename = `${id}-${digest}.${extension}`;
      const target = resolveWithin(paths.teamImageDir, filename);
      if (!fs.existsSync(target)) atomicWriteFile(target, image);
      return `/assets/images/team/${filename}`;
    },
  };
}
