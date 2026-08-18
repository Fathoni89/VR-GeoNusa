import { describe, expect, test } from 'vitest';
import { parseReportPagination } from '../../src/modules/reports/reports.schema';
import { escapeCsvValue } from '../../src/modules/reports/reports.service';

describe('CSV report aman untuk spreadsheet', () => {
  test.each([
    ['=HYPERLINK("https://example.invalid")', "'=HYPERLINK(\"https://example.invalid\")"],
    ['+SUM(1,1)', "'+SUM(1,1)"],
    ['-1+2', "'-1+2"],
    ['@SUM(1,1)', "'@SUM(1,1)"],
    ['\t=SUM(1,1)', "'\t=SUM(1,1)"],
  ])('menetralkan formula %s', (input, expected) => {
    expect(escapeCsvValue(input)).toBe(`"${expected.replaceAll('"', '""')}"`);
  });

  test('tetap meng-escape quote dan null seperti response legacy', () => {
    expect(escapeCsvValue('Nama "Siswa"')).toBe('"Nama ""Siswa"""');
    expect(escapeCsvValue(null)).toBe('');
  });
});

describe('pagination report', () => {
  test('mempertahankan default dan batas maksimal 100', () => {
    expect(parseReportPagination({})).toEqual({ page: 1, pageSize: 20, offset: 0 });
    expect(parseReportPagination({ page: '3', pageSize: '500' })).toEqual({
      page: 3,
      pageSize: 100,
      offset: 200,
    });
  });

  test('nilai negatif dan di luar safe integer kembali ke batas aman', () => {
    expect(parseReportPagination({ page: '-10', pageSize: '0' })).toEqual({
      page: 1,
      pageSize: 1,
      offset: 0,
    });
    expect(parseReportPagination({ page: '999999999999999999999999' })).toEqual({
      page: 1,
      pageSize: 20,
      offset: 0,
    });
  });
});
