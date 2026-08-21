import sharp from 'sharp';
import { assertFileIdentifier } from '../../shared/ids';
import type { TeamPhotoExtension, TeamRepository } from './team.repository';
import {
  teamMemberSchema,
  teamReorderSchema,
  teamUpdateSchema,
  type TeamMember,
} from './team.schema';

interface ServiceError {
  ok: false;
  status: number;
  message: string;
}

interface ServiceSuccess<T> {
  ok: true;
  value: T;
}

export type TeamServiceResult<T> = ServiceSuccess<T> | ServiceError;

export interface TeamService {
  list(): TeamMember[];
  create(body: unknown): TeamServiceResult<TeamMember>;
  update(teamId: unknown, body: unknown): TeamServiceResult<TeamMember>;
  delete(teamId: unknown): TeamServiceResult<string>;
  reorder(body: unknown): TeamServiceResult<TeamMember[]>;
  uploadPhoto(teamId: unknown, image: Buffer): Promise<TeamServiceResult<string>>;
}

function invalidMember(): ServiceError {
  return { ok: false, status: 400, message: 'Data anggota tidak valid' };
}

async function detectPhotoExtension(image: Buffer): Promise<TeamPhotoExtension | null> {
  try {
    const metadata = await sharp(image, { failOn: 'error' }).metadata();
    if (!metadata.width || !metadata.height) return null;
    if (metadata.format === 'jpeg') return 'jpg';
    if (metadata.format === 'png' || metadata.format === 'webp') return metadata.format;
    return null;
  } catch {
    return null;
  }
}

export function createTeamService(repository: TeamRepository): TeamService {
  return {
    list() {
      return repository.read();
    },

    create(body) {
      const parsed = teamMemberSchema.safeParse(body);
      if (!parsed.success) return invalidMember();
      const team = repository.read();
      if (team.some(member => member.id === parsed.data.id)) {
        return { ok: false, status: 409, message: `ID "${parsed.data.id}" sudah ada` };
      }
      const member = {
        ...parsed.data,
        order: parsed.data.order ?? team.length + 1,
      };
      team.push(member);
      repository.write(team);
      return { ok: true, value: member };
    },

    update(teamId, body) {
      const id = assertFileIdentifier(teamId, 'team_id');
      const input = teamUpdateSchema.safeParse(body);
      if (!input.success) return invalidMember();
      const team = repository.read();
      const index = team.findIndex(member => member.id === id);
      if (index < 0) {
        return { ok: false, status: 404, message: 'Anggota tidak ditemukan' };
      }
      const member = teamMemberSchema.safeParse({ ...team[index], ...input.data, id });
      if (!member.success) return invalidMember();
      team[index] = member.data;
      repository.write(team);
      return { ok: true, value: member.data };
    },

    delete(teamId) {
      const id = assertFileIdentifier(teamId, 'team_id');
      const team = repository.read();
      const filtered = team.filter(member => member.id !== id);
      if (filtered.length === team.length) {
        return { ok: false, status: 404, message: 'Anggota tidak ditemukan' };
      }
      repository.write(filtered);
      return { ok: true, value: `Anggota "${id}" dihapus` };
    },

    reorder(body) {
      const input = teamReorderSchema.safeParse(body);
      if (!input.success) {
        return { ok: false, status: 400, message: 'Kirim array "order"' };
      }
      const team = repository.read();
      const requested = input.data.order;
      if (
        requested.length !== team.length
        || new Set(requested).size !== requested.length
        || requested.some(id => !team.some(member => member.id === id))
      ) {
        return { ok: false, status: 400, message: 'Urutan anggota tidak valid' };
      }
      const byId = new Map(team.map(member => [member.id, member]));
      const reordered = requested.map((id, index) => ({
        ...byId.get(id) as TeamMember,
        order: index + 1,
      }));
      repository.write(reordered);
      return { ok: true, value: reordered };
    },

    async uploadPhoto(teamId, image) {
      const id = assertFileIdentifier(teamId, 'team_id');
      const team = repository.read();
      const index = team.findIndex(member => member.id === id);
      if (index < 0) {
        return { ok: false, status: 404, message: 'Anggota tidak ditemukan' };
      }
      const extension = await detectPhotoExtension(image);
      if (!extension) {
        return { ok: false, status: 415, message: 'Foto harus berupa JPEG, PNG, atau WebP yang valid' };
      }
      const photo = repository.writePhoto(id, extension, image);
      team[index] = { ...team[index], photo };
      repository.write(team);
      return { ok: true, value: photo };
    },
  };
}
