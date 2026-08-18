export interface ReportQueryInput {
  school_id?: unknown;
  class_id?: unknown;
  page?: unknown;
  pageSize?: unknown;
}

export interface ReportPagination {
  page: number;
  pageSize: number;
  offset: number;
}

export type ParsedFilterId =
  | { ok: true; value: number | null }
  | { ok: false; status: 400; message: string };

export function parseReportFilterId(value: unknown, fieldName: string): ParsedFilterId {
  if (value === undefined || value === null || value === '') {
    return { ok: true, value: null };
  }

  const text = String(value);
  const parsed = Number(text);
  if (!/^[1-9]\d*$/.test(text) || !Number.isSafeInteger(parsed)) {
    return {
      ok: false,
      status: 400,
      message: `${fieldName} harus berupa bilangan bulat positif`,
    };
  }
  return { ok: true, value: parsed };
}

export function parseReportPagination(query: ReportQueryInput): ReportPagination {
  const parsedPage = Number.parseInt(String(query.page ?? ''), 10);
  const parsedPageSize = Number.parseInt(String(query.pageSize ?? ''), 10);
  const safePage = Number.isSafeInteger(parsedPage) ? parsedPage : 1;
  const safePageSize = Number.isSafeInteger(parsedPageSize) ? parsedPageSize : 20;
  const page = Math.max(1, safePage);
  const pageSize = Math.min(
    100,
    Math.max(1, safePageSize),
  );
  return { page, pageSize, offset: (page - 1) * pageSize };
}
