export interface HealthDatabase {
  query(sql: string): Promise<unknown>;
}

export interface HealthRepository {
  databaseReady(): Promise<boolean>;
}

export function createHealthRepository(
  getDatabase: () => HealthDatabase,
): HealthRepository {
  return {
    async databaseReady() {
      const result = await getDatabase().query('SELECT 1 AS ok');
      if (!Array.isArray(result) || !Array.isArray(result[0])) return false;
      const row = result[0][0] as { ok?: unknown } | undefined;
      return row?.ok === 1;
    },
  };
}
