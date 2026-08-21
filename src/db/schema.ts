import { sql } from 'drizzle-orm';
import {
  boolean,
  datetime,
  float,
  index,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  tinyint,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/mysql-core';

const defaultDateTime = (name: string) => datetime(name, { mode: 'date' })
  .notNull()
  .default(sql`CURRENT_TIMESTAMP`);
const createdAt = () => defaultDateTime('created_at');

export const schools = mysqlTable('schools', {
  id: int('id').autoincrement().primaryKey(),
  name: varchar('name', { length: 150 }).notNull(),
  code: varchar('code', { length: 30 }),
  createdAt: createdAt(),
}, table => [uniqueIndex('uniq_schools_code').on(table.code)]);

export const accounts = mysqlTable('accounts', {
  id: int('id').autoincrement().primaryKey(),
  username: varchar('username', { length: 100 }).notNull(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  role: mysqlEnum('role', ['super_admin', 'school_admin', 'teacher'])
    .notNull()
    .default('teacher'),
  schoolId: int('school_id').references(() => schools.id, {
    onDelete: 'restrict',
    onUpdate: 'cascade',
  }),
  mustChangePassword: boolean('must_change_password').notNull().default(false),
  authVersion: int('auth_version', { unsigned: true }).notNull().default(0),
  createdAt: createdAt(),
}, table => [
  uniqueIndex('uniq_accounts_username').on(table.username),
  index('idx_accounts_school').on(table.schoolId),
]);

export const users = mysqlTable('users', {
  id: int('id').autoincrement().primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  role: varchar('role', { length: 20 }),
  schoolId: int('school_id').references(() => schools.id, {
    onDelete: 'set null',
    onUpdate: 'cascade',
  }),
  createdAt: createdAt(),
}, table => [index('idx_users_school').on(table.schoolId)]);

export const classes = mysqlTable('classes', {
  id: int('id').autoincrement().primaryKey(),
  schoolId: int('school_id').notNull().references(() => schools.id, {
    onDelete: 'restrict',
    onUpdate: 'cascade',
  }),
  teacherAccountId: int('teacher_account_id').notNull().references(() => accounts.id, {
    onDelete: 'restrict',
    onUpdate: 'cascade',
  }),
  className: varchar('class_name', { length: 100 }).notNull(),
  gradeLevel: varchar('grade_level', { length: 20 }),
  academicYear: varchar('academic_year', { length: 20 }),
  createdAt: createdAt(),
}, table => [
  index('idx_classes_school').on(table.schoolId),
  index('idx_classes_teacher').on(table.teacherAccountId),
]);

export const students = mysqlTable('students', {
  id: int('id').autoincrement().primaryKey(),
  schoolId: int('school_id').notNull().references(() => schools.id, {
    onDelete: 'restrict',
    onUpdate: 'cascade',
  }),
  classId: int('class_id').notNull().references(() => classes.id, {
    onDelete: 'restrict',
    onUpdate: 'cascade',
  }),
  name: varchar('name', { length: 100 }).notNull(),
  studentNumber: varchar('student_number', { length: 50 }).notNull(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  authVersion: int('auth_version', { unsigned: true }).notNull().default(0),
  createdAt: createdAt(),
}, table => [
  uniqueIndex('uniq_student_number_per_school').on(table.schoolId, table.studentNumber),
  index('idx_students_class').on(table.classId),
]);

export const sessions = mysqlTable('sessions', {
  id: int('id').autoincrement().primaryKey(),
  userId: int('user_id').references(() => users.id, {
    onDelete: 'set null',
    onUpdate: 'cascade',
  }),
  studentId: int('student_id').references(() => students.id, {
    onDelete: 'set null',
    onUpdate: 'cascade',
  }),
  schoolId: int('school_id').references(() => schools.id, {
    onDelete: 'set null',
    onUpdate: 'cascade',
  }),
  classId: int('class_id').references(() => classes.id, {
    onDelete: 'set null',
    onUpdate: 'cascade',
  }),
  writeTokenHash: varchar('write_token_hash', { length: 64 }),
  sceneName: varchar('scene_name', { length: 100 }).notNull(),
  startedAt: defaultDateTime('started_at'),
  endedAt: datetime('ended_at', { mode: 'date' }),
  durationSeconds: int('duration_seconds'),
  deviceType: varchar('device_type', { length: 20 }),
}, table => [
  index('idx_sessions_user').on(table.userId),
  index('idx_sessions_student').on(table.studentId),
  index('idx_sessions_school').on(table.schoolId),
  index('idx_sessions_class').on(table.classId),
  index('idx_sessions_started').on(table.startedAt),
  index('idx_sessions_report_scope').on(
    table.schoolId,
    table.classId,
    table.studentId,
    table.startedAt,
  ),
]);

export const objects = mysqlTable('objects', {
  id: int('id').autoincrement().primaryKey(),
  objectCode: varchar('object_code', { length: 100 }).notNull(),
  objectName: varchar('object_name', { length: 150 }).notNull(),
  geometryLabel: varchar('geometry_label', { length: 100 }).notNull(),
  description: text('description'),
  formula: varchar('formula', { length: 255 }),
  culturalContext: text('cultural_context'),
}, table => [uniqueIndex('uniq_objects_code').on(table.objectCode)]);

export const predictions = mysqlTable('predictions', {
  id: int('id').autoincrement().primaryKey(),
  sessionId: int('session_id').references(() => sessions.id, {
    onDelete: 'cascade',
    onUpdate: 'cascade',
  }),
  objectId: int('object_id').references(() => objects.id, {
    onDelete: 'set null',
    onUpdate: 'cascade',
  }),
  predictedLabel: varchar('predicted_label', { length: 100 }).notNull(),
  confidenceScore: float('confidence_score').notNull(),
  isCorrect: tinyint('is_correct'),
  createdAt: createdAt(),
}, table => [
  index('idx_predictions_session').on(table.sessionId),
  index('idx_predictions_object').on(table.objectId),
]);

export const interactions = mysqlTable('interactions', {
  id: int('id').autoincrement().primaryKey(),
  sessionId: int('session_id').references(() => sessions.id, {
    onDelete: 'cascade',
    onUpdate: 'cascade',
  }),
  objectId: int('object_id').references(() => objects.id, {
    onDelete: 'set null',
    onUpdate: 'cascade',
  }),
  interactionType: varchar('interaction_type', { length: 30 }).notNull(),
  gazeDuration: float('gaze_duration'),
  timestamp: datetime('timestamp', { mode: 'date' }).notNull().default(sql`CURRENT_TIMESTAMP`),
}, table => [
  index('idx_interactions_session').on(table.sessionId),
  index('idx_interactions_object').on(table.objectId),
]);

export const quizResults = mysqlTable('quiz_results', {
  id: int('id').autoincrement().primaryKey(),
  sessionId: int('session_id').references(() => sessions.id, {
    onDelete: 'cascade',
    onUpdate: 'cascade',
  }),
  questionId: varchar('question_id', { length: 100 }).notNull(),
  answer: varchar('answer', { length: 255 }).notNull(),
  isCorrect: tinyint('is_correct').notNull(),
  responseTime: float('response_time'),
  createdAt: createdAt(),
}, table => [
  index('idx_quiz_results_session').on(table.sessionId),
  index('idx_quiz_results_question').on(table.questionId),
]);
