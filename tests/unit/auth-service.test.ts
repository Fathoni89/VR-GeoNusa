import { describe, expect, test, vi } from 'vitest';
import type {
  AuthRepository,
  StaffAccountRecord,
} from '../../src/modules/auth/auth.repository';
import {
  createAuthService,
  type AuthTokenCodec,
  type PasswordCodec,
} from '../../src/modules/auth/auth.service';

function createRepository(overrides: Partial<AuthRepository> = {}): AuthRepository {
  return {
    findStaffByUsername: async () => null,
    findStaffById: async () => null,
    findStudentByCredentials: async () => null,
    findStudentById: async () => null,
    updateStaffPasswordAndIncrementVersion: async () => false,
    ...overrides,
  };
}

function createTokenCodec(overrides: Partial<AuthTokenCodec> = {}): AuthTokenCodec {
  return {
    sign: () => 'signed-token',
    verify: () => null,
    ...overrides,
  };
}

function createPasswordCodec(compare: PasswordCodec['compare']): PasswordCodec {
  return {
    compare,
    hash: async () => 'new-password-hash',
  };
}

describe('auth service anti-enumeration', () => {
  test('login staf unknown tetap membandingkan password sekali dengan dummy hash', async () => {
    const findStaffByUsername = vi.fn(async () => null);
    const comparePassword = vi.fn(async () => false);
    const signToken = vi.fn(() => 'signed-token');
    const service = createAuthService({
      repository: createRepository({ findStaffByUsername }),
      passwords: createPasswordCodec(comparePassword),
      tokens: createTokenCodec({ sign: signToken }),
    });

    const result = await service.loginStaff({
      username: 'tidak-ada',
      password: 'password-salah',
    });

    expect(result).toBeNull();
    expect(findStaffByUsername).toHaveBeenCalledOnce();
    expect(comparePassword).toHaveBeenCalledOnce();
    expect(comparePassword).toHaveBeenCalledWith(
      'password-salah',
      expect.stringMatching(/^\$2[aby]\$\d{2}\$.{53}$/),
    );
    expect(signToken).not.toHaveBeenCalled();
  });

  test('login siswa unknown tetap membandingkan password sekali dengan dummy hash', async () => {
    const findStudentByCredentials = vi.fn(async () => null);
    const comparePassword = vi.fn(async () => false);
    const signToken = vi.fn(() => 'signed-token');
    const service = createAuthService({
      repository: createRepository({ findStudentByCredentials }),
      passwords: createPasswordCodec(comparePassword),
      tokens: createTokenCodec({ sign: signToken }),
    });

    const result = await service.loginStudent({
      school_id: 10,
      student_number: 'S-UNKNOWN',
      password: 'password-salah',
    });

    expect(result).toBeNull();
    expect(findStudentByCredentials).toHaveBeenCalledOnce();
    expect(findStudentByCredentials).toHaveBeenCalledWith(10, 'S-UNKNOWN');
    expect(comparePassword).toHaveBeenCalledOnce();
    expect(comparePassword).toHaveBeenCalledWith(
      'password-salah',
      expect.stringMatching(/^\$2[aby]\$\d{2}\$.{53}$/),
    );
    expect(signToken).not.toHaveBeenCalled();
  });
});

describe('auth service token verification', () => {
  const tokenClaims = {
    account_id: 11,
    username: 'teacher-a',
    role: 'teacher' as const,
    school_id: 10,
    must_change_password: false,
    auth_version: 4,
  };

  const account: StaffAccountRecord = {
    id: 11,
    username: 'teacher-a',
    password_hash: 'stored-password-hash',
    role: 'teacher',
    school_id: 10,
    must_change_password: 0,
    auth_version: 4,
  };

  test('token ditolak ketika backing account sudah tidak ada', async () => {
    const findStaffById = vi.fn(async () => null);
    const service = createAuthService({
      repository: createRepository({ findStaffById }),
      passwords: createPasswordCodec(async () => false),
      tokens: createTokenCodec({ verify: () => tokenClaims }),
    });

    const result = await service.verifyToken('staff-token');

    expect(result).toBeNull();
    expect(findStaffById).toHaveBeenCalledOnce();
    expect(findStaffById).toHaveBeenCalledWith(11);
  });

  test('token ditolak ketika auth_version berbeda dari backing account', async () => {
    const findStaffById = vi.fn(async () => ({ ...account, auth_version: 5 }));
    const service = createAuthService({
      repository: createRepository({ findStaffById }),
      passwords: createPasswordCodec(async () => false),
      tokens: createTokenCodec({ verify: () => tokenClaims }),
    });

    const result = await service.verifyToken('staff-token');

    expect(result).toBeNull();
    expect(findStaffById).toHaveBeenCalledOnce();
  });
});
