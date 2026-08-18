import type { AccountPrincipal } from '../../shared/types';
import type {
  ReportScope,
  ReportsRepository,
  ReportSummaryRows,
} from './reports.repository';
import {
  parseReportFilterId,
  parseReportPagination,
  type ReportQueryInput,
} from './reports.schema';

interface ServiceError {
  ok: false;
  status: number;
  message: string;
}

interface ServiceSuccess<T> {
  ok: true;
  value: T;
}

export type ReportsServiceResult<T> = ServiceSuccess<T> | ServiceError;

const GEOMETRY_NAMES: Record<string, string> = {
  balok: 'Balok',
  kerucut: 'Kerucut',
  'limas-segiempat': 'Limas Segiempat',
  'prisma-segitiga': 'Prisma Segitiga',
  'setengah-bola': 'Setengah Bola',
  tabung: 'Tabung',
};

const CSV_FIELDS = [
  'id',
  'student_name',
  'school_name',
  'class_name',
  'scene_name',
  'started_at',
  'ended_at',
  'duration_seconds',
  'device_type',
] as const;

export const REPORT_CSV_HEADER = CSV_FIELDS.join(',');

export function escapeCsvValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  let text = String(value);
  if (typeof value === 'string' && /^[\t\r\n ]*[=+@-]/.test(text)) {
    text = `'${text}`;
  }
  return `"${text.replaceAll('"', '""')}"`;
}

function recommendation(label: string, accuracyPct: number, attempts: number): string {
  const name = GEOMETRY_NAMES[label] || label;
  if (attempts < 3) {
    return `Data untuk konsep ${name} masih sedikit (${attempts} percobaan) — belum cukup untuk rekomendasi yang andal.`;
  }
  if (accuracyPct < 60) {
    return `Sebagian besar siswa masih kesulitan dengan konsep ${name} (akurasi ${accuracyPct}%). Guru disarankan memberi contoh konkret tambahan sebelum sesi VR berikutnya.`;
  }
  if (accuracyPct < 85) {
    return `Siswa sudah cukup baik pada konsep ${name} (akurasi ${accuracyPct}%), tapi masih perlu penguatan pada beberapa siswa.`;
  }
  return `Siswa sudah menguasai konsep ${name} dengan baik (akurasi ${accuracyPct}%).`;
}

function conceptRecommendations(
  rows: ReportSummaryRows['perQuestion'],
  repository: ReportsRepository,
): Array<Record<string, unknown>> {
  const totals = new Map<string, { attempts: number; correct: number }>();
  for (const row of rows) {
    const concept = repository.findQuestionConcept(String(row.question_id));
    if (!concept) continue;
    const current = totals.get(concept) ?? { attempts: 0, correct: 0 };
    current.attempts += Number(row.attempts);
    current.correct += Number(row.correct);
    totals.set(concept, current);
  }
  return [...totals.entries()].map(([label, total]) => {
    const accuracyPct = Math.round((total.correct / total.attempts) * 1000) / 10;
    return {
      geometry_label: label,
      geometry_name: GEOMETRY_NAMES[label] || label,
      attempts: total.attempts,
      correct: total.correct,
      accuracy_pct: accuracyPct,
      recommendation: recommendation(label, accuracyPct, total.attempts),
    };
  }).sort((left, right) => Number(left.accuracy_pct) - Number(right.accuracy_pct));
}

async function resolveScope(
  repository: ReportsRepository,
  account: AccountPrincipal,
  query: ReportQueryInput,
): Promise<ReportsServiceResult<ReportScope>> {
  let schoolId: number | null;
  if (account.role === 'super_admin') {
    const parsedSchool = parseReportFilterId(query.school_id, 'school_id');
    if (!parsedSchool.ok) return parsedSchool;
    schoolId = parsedSchool.value;
    if (schoolId !== null && !await repository.schoolExists(schoolId)) {
      return { ok: false, status: 403, message: 'Filter laporan di luar cakupan akun' };
    }
  } else {
    schoolId = Number(account.school_id);
    if (!Number.isSafeInteger(schoolId) || schoolId <= 0) {
      return { ok: false, status: 403, message: 'Scope laporan akun tidak valid' };
    }
  }

  const parsedClass = parseReportFilterId(query.class_id, 'class_id');
  if (!parsedClass.ok) return parsedClass;
  const scope: ReportScope = {
    schoolId,
    classId: parsedClass.value,
    teacherAccountId: account.role === 'teacher' ? account.account_id : null,
  };
  if (scope.classId !== null && !await repository.classExists(scope)) {
    return { ok: false, status: 403, message: 'Filter laporan di luar cakupan akun' };
  }
  return { ok: true, value: scope };
}

export interface ReportsService {
  summary(
    account: AccountPrincipal,
    query: ReportQueryInput,
  ): Promise<ReportsServiceResult<Record<string, unknown>>>;
  exportCsv(
    account: AccountPrincipal,
    query: ReportQueryInput,
  ): Promise<ReportsServiceResult<string>>;
}

export function createReportsService(repository: ReportsRepository): ReportsService {
  return {
    async summary(account, query) {
      const scope = await resolveScope(repository, account, query);
      if (!scope.ok) return scope;
      const pagination = parseReportPagination(query);
      const rows = await repository.summary(
        scope.value,
        pagination,
        account.role === 'super_admin',
      );
      const total = Number(rows.totals.total_sessions);
      return {
        ok: true,
        value: {
          totals: rows.totals,
          perQuestion: rows.perQuestion,
          perObject: rows.perObject,
          perSchool: rows.perSchool,
          perClass: rows.perClass,
          availableClasses: rows.availableClasses,
          recentSessions: rows.recentSessions,
          conceptRecommendations: conceptRecommendations(rows.perQuestion, repository),
          pagination: {
            page: pagination.page,
            pageSize: pagination.pageSize,
            total,
            totalPages: Math.ceil(total / pagination.pageSize),
          },
        },
      };
    },

    async exportCsv(account, query) {
      const scope = await resolveScope(repository, account, query);
      if (!scope.ok) return scope;
      const rows = await repository.exportRows(scope.value);
      const lines = rows.map(row => CSV_FIELDS
        .map(field => escapeCsvValue(row[field]))
        .join(','));
      return { ok: true, value: [REPORT_CSV_HEADER, ...lines].join('\n') };
    },
  };
}
