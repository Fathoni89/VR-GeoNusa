import { z } from 'zod';

export const MAX_BULK_STUDENTS = 100;
export const MAX_STUDENT_NAME_LENGTH = 100;
export const MAX_STUDENT_NUMBER_LENGTH = 50;

export const bulkStudentsSchema = z.object({
  students: z.array(z.unknown()).min(1).max(MAX_BULK_STUDENTS),
}).passthrough();

export const bulkStudentItemSchema = z.object({
  name: z.string(),
  student_number: z.string(),
}).passthrough();
