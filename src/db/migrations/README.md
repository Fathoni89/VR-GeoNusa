# Database migrations

`src/db/schema.ts` dan SQL di folder ini adalah sumber schema aktif. File
`db/schema.mysql.sql` hanya snapshot legacy untuk jalur upgrade.

Generate migration baru dengan `npm run db:generate`, lalu review SQL-nya.
Jalankan migration hanya dalam maintenance window dengan empat gate berikut:

```powershell
$env:MIGRATION_BACKUP_REFERENCE = 'lokasi/id-backup-terverifikasi'
$env:MIGRATION_TARGET = "$env:DB_HOST`:$env:DB_PORT/$env:DB_NAME"
$env:MIGRATION_MAINTENANCE_WINDOW = 'id-window-yang-disetujui'
npm run db:migrate -- --approve
```

Database kosong menjalankan seluruh SQL. Database legacy lengkap diaudit,
direkonsiliasi secara idempotent, lalu dicatat sebagai baseline Drizzle.
Schema parsial dan orphan selalu ditolak.

Rollback tidak menghapus kolom atau data secara otomatis. Hentikan aplikasi,
buat ulang database target, lalu restore backup yang disebut oleh
`MIGRATION_BACKUP_REFERENCE`; verifikasi jumlah row dan constraint sebelum
membuka maintenance window.
