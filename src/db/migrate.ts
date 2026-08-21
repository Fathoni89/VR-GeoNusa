import path from 'node:path';
import { drizzle } from 'drizzle-orm/mysql2';
import { migrate } from 'drizzle-orm/mysql2/migrator';
import { runtimeEnv } from '../config/env';
import { createDatabasePool } from './client';
import { auditOrphans } from './orphan-audit';
import {
  detectDatabaseState,
  markLegacyBaseline,
  upgradeLegacySchema,
} from './legacy-baseline';

export interface MigrationApproval {
  approved: boolean;
  backupReference?: string;
  target?: string;
  maintenanceWindow?: string;
}

export function assertMigrationApproval(
  approval: MigrationApproval,
  expectedTarget: string,
): void {
  if (!approval.approved) throw new Error('SQL migration belum disetujui');
  if (!approval.backupReference?.trim()) throw new Error('Referensi backup wajib diisi');
  if (approval.target !== expectedTarget) throw new Error('Konfirmasi target database tidak cocok');
  if (!approval.maintenanceWindow?.trim()) throw new Error('Maintenance window wajib diisi');
}

export async function main(): Promise<void> {
  const databaseName = runtimeEnv.DB_NAME;
  if (!databaseName) throw new Error('DB_NAME wajib diisi');
  const expectedTarget = `${runtimeEnv.DB_HOST}:${runtimeEnv.DB_PORT}/${databaseName}`;
  assertMigrationApproval({
    approved: process.argv.includes('--approve'),
    backupReference: process.env.MIGRATION_BACKUP_REFERENCE,
    target: process.env.MIGRATION_TARGET,
    maintenanceWindow: process.env.MIGRATION_MAINTENANCE_WINDOW,
  }, expectedTarget);

  const pool = createDatabasePool(runtimeEnv);
  try {
    const migrationsFolder = path.resolve(__dirname, 'migrations');
    const issuesBefore = await auditOrphans(pool, databaseName);
    if (issuesBefore.length > 0) {
      throw new Error(`Migration dibatalkan; orphan terdeteksi: ${JSON.stringify(issuesBefore)}`);
    }
    const state = await detectDatabaseState(pool, databaseName);
    if (state === 'legacy') {
      await upgradeLegacySchema(pool, databaseName, runtimeEnv.BOOTSTRAP_ADMIN_PASSWORD);
      const issuesAfterUpgrade = await auditOrphans(pool, databaseName);
      if (issuesAfterUpgrade.length > 0) {
        throw new Error(`Migration dibatalkan; orphan terdeteksi: ${JSON.stringify(issuesAfterUpgrade)}`);
      }
      await markLegacyBaseline(pool, migrationsFolder);
    }
    await migrate(drizzle({ client: pool }), {
      migrationsFolder,
    });
    const issuesAfter = await auditOrphans(pool, databaseName);
    if (issuesAfter.length > 0) {
      throw new Error(`Migration selesai dengan orphan: ${JSON.stringify(issuesAfter)}`);
    }
  } finally {
    await pool.end();
  }
}
