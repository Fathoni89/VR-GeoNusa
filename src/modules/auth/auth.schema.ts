import { z } from 'zod';

const nonEmptyString = z.string().min(1);

export const staffLoginSchema = z.object({
  username: nonEmptyString,
  password: nonEmptyString,
}).passthrough();

export const changePasswordSchema = z.object({
  old_password: nonEmptyString,
  new_password: nonEmptyString.min(6),
}).passthrough();

export const studentLoginSchema = z.object({
  school_id: z.union([z.number().int().positive(), nonEmptyString]),
  student_number: nonEmptyString,
  password: nonEmptyString,
}).passthrough();

const staffRoleSchema = z.enum(['super_admin', 'school_admin', 'teacher']);
const authVersionSchema = z.number().int().nonnegative();

export const staffTokenClaimsSchema = z.object({
  account_id: z.number().int().positive(),
  username: nonEmptyString,
  role: staffRoleSchema,
  school_id: z.number().int().positive().nullable(),
  must_change_password: z.boolean(),
  auth_version: authVersionSchema,
});

export const studentTokenClaimsSchema = z.object({
  student_id: z.number().int().positive(),
  name: nonEmptyString,
  role: z.literal('student'),
  school_id: z.number().int().positive(),
  class_id: z.number().int().positive().nullable(),
  auth_version: authVersionSchema,
});

export const authTokenClaimsSchema = z.union([
  staffTokenClaimsSchema,
  studentTokenClaimsSchema,
]);

export type StaffLoginInput = z.infer<typeof staffLoginSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type StudentLoginInput = z.infer<typeof studentLoginSchema>;
export type StaffTokenClaims = z.infer<typeof staffTokenClaimsSchema>;
export type StudentTokenClaims = z.infer<typeof studentTokenClaimsSchema>;
export type AuthTokenClaims = z.infer<typeof authTokenClaimsSchema>;
