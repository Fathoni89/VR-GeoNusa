# Rencana Migrasi Arsitektur VR-GeoNusa

Status: **Draft untuk eksekusi bertahap**  
Target: **Feature-based modular monolith dengan Clean Architecture pragmatis dan ML worker terisolasi**  
Strategi: **Incremental strangler migration**  
Tanggal penyusunan: **13 Agustus 2026**

## 1. Tujuan

Migrasikan VR-GeoNusa dari backend Express monolitik satu file dan frontend statis yang saling terduplikasi menjadi:

- backend modular berdasarkan fitur/domain;
- TypeScript untuk seluruh kode baru;
- admin dashboard React yang aman dan mudah dipelihara;
- aplikasi VR Vite + TypeScript + A-Frame;
- kontrak API bersama menggunakan Zod;
- migrasi MySQL yang versioned;
- inferensi ML pada worker terisolasi;
- test otomatis dan quality gate CI;
- deployment server dan demo GitHub Pages yang tetap kompatibel.

Migrasi harus dilakukan tanpa rewrite besar dan tanpa memutus URL `/api/*` yang sedang digunakan.

## 2. Kondisi Repository Saat Rencana Dibuat

Temuan baseline yang harus dianggap sebagai konteks eksekusi:

- `server.js` memiliki sekitar 1.417 baris dan menampung hampir seluruh route, autentikasi, authorization, query, filesystem, laporan, dan startup.
- `public/admin/index.html` memiliki sekitar 1.769 baris.
- `public/js/tour.js` memiliki sekitar 764 baris.
- Repository belum memiliki unit test, integration test, E2E test, lint, TypeScript, atau build frontend.
- Backend memakai Express 4, MySQL, JWT, bcrypt, dan `@tensorflow/tfjs-node`.
- Import TensorFlow.js Node gagal pada Node.js 24 LTS karena native binding tidak tersedia.
- Terdapat source/data yang diduplikasi antara root dan `public/`.
- GitHub Pages hanya dapat menjalankan mode statis; fitur login, laporan, dan penyimpanan memerlukan Node.js + MySQL.
- Saat rencana dibuat, `package.json` telah dimodifikasi pengguna dan `.agents/` serta `bun.lock` masih untracked. Perubahan tersebut tidak boleh ditimpa atau dihapus tanpa izin.

## 3. Arsitektur Target

```text
VR-GeoNusa/
├── apps/
│   ├── api/
│   │   └── src/
│   │       ├── app.ts
│   │       ├── server.ts
│   │       ├── config/
│   │       ├── db/
│   │       ├── middleware/
│   │       ├── modules/
│   │       │   ├── auth/
│   │       │   ├── schools/
│   │       │   ├── accounts/
│   │       │   ├── classes/
│   │       │   ├── students/
│   │       │   ├── sessions/
│   │       │   ├── learning-events/
│   │       │   ├── scenes/
│   │       │   ├── tours/
│   │       │   ├── reports/
│   │       │   ├── team/
│   │       │   └── ml/
│   │       └── shared/
│   ├── admin/
│   └── vr/
├── packages/
│   ├── contracts/
│   └── testing/
├── public/
│   └── assets/
├── tests/
└── package.json
```

Alur backend per fitur:

```text
HTTP route
    ↓
input validation
    ↓
authentication dan authorization
    ↓
service/use-case
    ↓
repository
    ↓
MySQL atau filesystem
```

Alur ML:

```text
API → ML service → worker_threads → ONNX Runtime → model
```

## 4. Keputusan Arsitektur

### 4.1 Modular monolith, bukan microservices

Backend tetap satu aplikasi dan satu deployment. Pemisahan dilakukan pada source code berdasarkan fitur. Microservices tidak digunakan selama skala aplikasi masih pilot dan seluruh fitur masih berbagi satu database.

### 4.2 Feature-based modules

Setiap fitur menggunakan pola berikut:

```text
src/modules/<feature>/
├── <feature>.router.ts
├── <feature>.schema.ts
├── <feature>.service.ts
├── <feature>.repository.ts
└── <feature>.test.ts
```

Tanggung jawab:

- `router`: transport HTTP dan mapping status code;
- `schema`: validasi body, query, dan parameter;
- `service`: aturan bisnis, authorization, dan transaksi;
- `repository`: query database atau akses filesystem;
- `test`: behavior fitur dan failure path.

Jangan membuat generic base repository, service superclass, atau abstraction lain yang belum memiliki minimal dua implementasi nyata.

### 4.3 Backward compatibility

- URL `/api/*` dipertahankan selama migrasi.
- Bentuk response dipertahankan kecuali perubahan keamanan secara eksplisit memerlukannya.
- `server.js` lama dipertahankan sebagai entry point kompatibilitas sampai fase cleanup.
- Admin baru berjalan di `/admin-v2` sebelum menggantikan `/admin`.
- Demo statis GitHub Pages tetap dipertahankan.

## 5. Aturan Eksekusi untuk Model

Aturan ini wajib diikuti oleh setiap model yang mengeksekusi rencana:

1. Kerjakan hanya satu fase atau satu subfase per task.
2. Jangan mengerjakan fase berikutnya sebelum seluruh acceptance criteria fase aktif terpenuhi.
3. Periksa `git status` sebelum mengubah file.
4. Pertahankan seluruh perubahan pengguna yang tidak terkait.
5. Jangan menghapus `server.js`, admin lama, asset, panorama, dataset, atau model sebelum fase cleanup.
6. Jangan mengubah URL atau response API tanpa instruksi eksplisit pada fase aktif.
7. Jangan menjalankan migrasi pada database produksi.
8. Jangan menggunakan `npm audit fix --force`.
9. Jangan memperkenalkan microservices, Redis, message broker, container orchestration, atau state-management frontend tambahan.
10. Jangan menggunakan `dangerouslySetInnerHTML` pada admin React.
11. Jangan memindahkan atau menghapus file Git LFS tanpa persetujuan pengguna.
12. Gunakan npm sebagai package manager default. Jangan menghapus `bun.lock` sebelum pengguna mengizinkan.
13. Setiap perubahan behavior harus memiliki regression test.
14. Jika keputusan tidak tercantum pada rencana, berhenti dan tanyakan kepada pengguna.
15. Setelah task selesai, laporkan file berubah, behavior berubah, test yang dijalankan, hasil test, dan risiko tersisa.

## 6. Checklist Fase

- [ ] Fase 0 — Baseline dan perlindungan migrasi
- [ ] Fase 1 — Pisahkan startup dari aplikasi
- [ ] Fase 2 — Tambahkan safety net
- [ ] Fase 3A — Tutup path traversal
- [ ] Fase 3B — Amankan bootstrap dan login admin
- [ ] Fase 3C — Terapkan ownership sesi
- [ ] Fase 3D — Pindahkan penilaian kuis ke server
- [ ] Fase 3E — Perbaiki tenant isolation laporan
- [ ] Fase 3F — Tutup XSS dan perbaiki autentikasi browser
- [ ] Fase 4 — Introduksi TypeScript
- [ ] Fase 5 — Buat fondasi modular monolith
- [ ] Fase 6A — Ekstrak module auth
- [ ] Fase 6B — Ekstrak module schools dan accounts
- [ ] Fase 6C — Ekstrak module classes dan students
- [ ] Fase 6D — Ekstrak module sessions dan learning-events
- [ ] Fase 6E — Ekstrak module scenes dan objects
- [ ] Fase 6F — Ekstrak module tours dan dataset
- [ ] Fase 6G — Ekstrak module reports
- [ ] Fase 6H — Ekstrak module team
- [ ] Fase 6I — Ekstrak health dan static application
- [ ] Fase 7 — Migrasi database versioned
- [ ] Fase 8A — Isolasi ML dalam worker
- [ ] Fase 8B — Migrasi model ke ONNX
- [ ] Fase 9 — Migrasi frontend VR
- [ ] Fase 10 — Migrasi admin
- [ ] Fase 11 — Bentuk npm workspaces
- [ ] Fase 12 — CI, deployment, dan cleanup

---

## 7. Fase 0 — Baseline dan Perlindungan Migrasi

### Tujuan

Merekam kondisi awal dan memastikan migrasi tidak merusak perubahan pengguna.

### Pekerjaan

1. Buat branch `codex/modular-monolith-migration` jika pengguna mengizinkan pembuatan branch.
2. Rekam:
   - `git status --short`;
   - branch aktif;
   - commit terakhir;
   - versi Node.js dan npm;
   - daftar route pada `server.js`;
   - ukuran file utama;
   - dependency tree.
3. Jalankan pemeriksaan baseline:
   - `npm ci --dry-run`;
   - `node --check` pada seluruh JavaScript aplikasi;
   - smoke test frontend statis;
   - smoke test ML;
   - `npm audit` tanpa auto-fix.
4. Tambahkan dokumen:
   - `docs/architecture/ADR-001-modular-monolith.md`;
   - `docs/architecture/api-route-inventory.md`;
   - `docs/architecture/migration-checklist.md`.
5. Catat kegagalan yang sudah ada sebagai baseline, bukan sebagai regression baru.

### Larangan

- Jangan mengubah behavior.
- Jangan memperbarui dependency.
- Jangan membersihkan worktree.

### Verifikasi

- Dokumen route inventory mencakup seluruh deklarasi `app.get/post/put/patch/delete`.
- Status Git sesudah fase hanya menampilkan dokumen baseline baru dan perubahan pengguna sebelumnya.

### Acceptance criteria

- Baseline dapat direproduksi.
- Seluruh kegagalan awal terdokumentasi.
- Tidak ada source code runtime yang berubah.

---

## 8. Fase 1 — Pisahkan Startup dari Aplikasi

### Tujuan

Backend dapat di-import oleh test tanpa membuka port, menghubungkan database, atau memuat native ML.

### File utama

- `server.js`
- `ml/predict.js`

### Pekerjaan

1. Bungkus proses `initDb()` dan `app.listen()` dalam fungsi `startServer()`.
2. Jalankan fungsi hanya jika `require.main === module`.
3. Export minimal:
   - `app`;
   - `startServer`;
   - `initDb`.
4. Hilangkan `require('./ml/predict')` dari import-time startup.
5. Lazy-load provider ML ketika endpoint prediction dipanggil atau setelah HTTP server siap.
6. Jika ML tidak siap, kembalikan HTTP `503` dengan response JSON stabil.
7. Tambahkan centralized Express error middleware.
8. Pastikan async rejection menghasilkan response error dan tidak membuat request menggantung.

### Test wajib

- Import `server.js` tidak membuka port.
- Import tidak memuat TensorFlow native binding.
- Server tetap dapat menyala ketika ML gagal.
- Error async menghasilkan response JSON `500`.
- Health endpoint non-ML tetap bekerja.

### Acceptance criteria

Perintah berikut berhasil tanpa koneksi database dan tanpa membuka listener:

```bash
node -e "require('./server.js'); console.log('import-ok')"
```

Rollback cukup dengan mengembalikan perubahan pada `server.js` dan `ml/predict.js`; tidak ada perubahan data pada fase ini.

---

## 9. Fase 2 — Tambahkan Safety Net

### Tujuan

Membangun test karakterisasi sebelum route dipindahkan.

### Dependency pengembangan

- `vitest`
- `supertest`
- `typescript`
- `tsx`
- `eslint`
- `zod`
- type definitions yang diperlukan

### Struktur

```text
tests/
├── unit/
├── integration/
├── security/
└── fixtures/
```

### Test minimum

1. Route inventory test mendeteksi route yang hilang.
2. Login staf berhasil dan gagal.
3. Login siswa berhasil dan gagal.
4. Authorization matrix untuk:
   - `super_admin`;
   - `school_admin`;
   - `teacher`;
   - `student`;
   - guest.
5. Guru tidak bisa mengakses kelas guru lain.
6. School admin tidak bisa mengakses sekolah lain.
7. Scene ID tidak dapat keluar dari direktori data.
8. Session event tidak dapat ditulis oleh pemilik yang salah.
9. Nilai admin yang berasal dari API tidak dieksekusi sebagai HTML.
10. Export CSV membutuhkan autentikasi.
11. Kegagalan ML tidak mematikan API.

### Ketentuan database test

- Gunakan fake repository, disposable test database, atau fixture database yang terisolasi.
- Jangan memakai database development yang berisi data pengguna.
- Jangan memakai database production.
- Test harus dapat dijalankan berulang kali.

### Acceptance criteria

- Test dapat dijalankan melalui satu script npm.
- Test failure menghasilkan pesan yang menunjukkan kontrak mana yang berubah.
- Belum ada route bisnis yang dipindahkan.

---

## 10. Fase 3 — Perbaikan Keamanan Sebelum Modularisasi

Fase 3 harus dijalankan sebagai enam task terpisah.

### 10.1 Fase 3A — Path Traversal

#### Pekerjaan

1. Tambahkan validator ID terpusat.
2. Gunakan allowlist `^[a-z0-9-]+$` untuk identifier file-backed.
3. Gunakan `path.resolve()`.
4. Pastikan resolved path masih berada di dalam direktori yang diperbolehkan.
5. Terapkan pada:
   - scene ID;
   - tour ID;
   - node ID bila menjadi bagian path;
   - dataset class ID;
   - file lain yang berasal dari parameter request.

#### Test

- Tolak `../`, encoded slash, backslash, absolute path, drive path Windows, dan null byte.
- ID valid tetap bekerja.

#### Acceptance criteria

- Tidak ada parameter request yang digabungkan ke path tanpa validator.

### 10.2 Fase 3B — Bootstrap dan Login Admin

#### Pekerjaan

1. Hapus password bootstrap yang tetap.
2. Untuk database kosong, password bootstrap berasal dari environment.
3. Jangan mencetak password atau token ke log.
4. Tambahkan rate limiter khusus login staf.
5. Tambahkan `must_change_password`.
6. Tolak operasi admin selain ganti password selama flag masih aktif.

#### Test

- Startup database kosong gagal dengan pesan konfigurasi yang aman jika password bootstrap tidak tersedia.
- Login terkena rate limit.
- Password tidak muncul di log.
- Admin bootstrap wajib mengganti password.

### 10.3 Fase 3C — Ownership Sesi

#### Perubahan data

Tambahkan kolom `sessions.write_token_hash` melalui migration development/test terlebih dahulu.

#### Alur target

1. Pembuatan sesi guest menghasilkan token acak.
2. Database hanya menyimpan hash token.
3. Frontend menyimpan token dalam memory.
4. Event berikutnya mengirim `X-Session-Token`.
5. Siswa login boleh memakai JWT siswa sebagai bukti kepemilikan.
6. Server memvalidasi bahwa sesi dimiliki token atau siswa tersebut.

#### Endpoint terdampak

- `PUT /api/sessions/:id/end`
- `POST /api/interactions`
- `POST /api/predictions`
- `POST /api/quiz-results`

#### Compatibility

- Pertahankan field response yang lama.
- Field token baru boleh ditambahkan.
- Update `public/js/app.js` dan `public/js/tour.js` pada task yang sama karena keduanya adalah client kontrak sesi.

#### Test

- Token pemilik diterima.
- Token salah ditolak.
- Session ID asing ditolak.
- JWT siswa hanya dapat menulis ke sesi miliknya.

### 10.4 Fase 3D — Integritas Kuis

#### Pekerjaan

1. Client hanya dipercaya untuk mengirim `question_id` dan `answer`.
2. Server membaca `quiz.json`.
3. Server menghitung `is_correct`.
4. Tolak question ID atau jawaban yang tidak valid.
5. Validasi response time sebagai angka non-negatif dengan batas atas wajar.

#### Test

- `is_correct: true` palsu dari client diabaikan.
- Jawaban benar dan salah dinilai server.
- Question ID tidak dikenal ditolak.

### 10.5 Fase 3E — Tenant Isolation Laporan

#### Aturan scope

- `super_admin`: seluruh data atau filter sekolah valid.
- `school_admin`: hanya `school_id` dari token.
- `teacher`: hanya class dengan `teacher_account_id` miliknya.
- Query `class_id` harus diverifikasi berada dalam scope akun.

#### Endpoint

- `GET /api/reports/summary`
- `GET /api/reports/export.csv`

#### Test

- Guru A tidak melihat kelas Guru B dalam sekolah sama.
- School admin A tidak melihat sekolah B.
- Filter class lintas scope menghasilkan `403` atau data kosong secara konsisten.
- Summary dan CSV memakai filter identik.

### 10.6 Fase 3F — XSS dan Autentikasi Browser

#### Pekerjaan

1. Tambahkan escape helper untuk admin lama.
2. Jangan memasukkan nilai API mentah ke `innerHTML`.
3. Gunakan `textContent` ketika memungkinkan.
4. Tambahkan Helmet dan Content Security Policy.
5. Mulai dukung cookie `HttpOnly`, `Secure`, dan `SameSite`.
6. Pertahankan Bearer token lama sementara admin legacy masih digunakan.
7. Perbaiki export CSV melalui authenticated `fetch()` dan download `Blob`.

#### Test

- Payload HTML pada nama siswa/sekolah/kelas tampil sebagai teks.
- Token tidak tersedia melalui JavaScript ketika memakai admin baru.
- CSV berhasil diunduh oleh akun valid dan ditolak untuk akun tanpa izin.

---

## 11. Fase 4 — Introduksi TypeScript

### Tujuan

Membuat build campuran JavaScript/TypeScript tanpa konversi massal legacy.

### Konfigurasi

Tambahkan:

- `tsconfig.json`;
- `eslint.config.js`;
- script `typecheck`;
- script `lint`;
- script `test`;
- script `build`.

Ketentuan TypeScript:

- `strict: true` untuk file TypeScript;
- `allowJs: true`;
- `checkJs: false` untuk legacy;
- `noEmitOnError: true`;
- target runtime Node.js LTS yang disepakati;
- source map aktif untuk server.

### Aturan

- Semua file baru memakai TypeScript.
- Jangan mengonversi seluruh `server.js` sekaligus.
- Jangan menambahkan `any` tanpa komentar alasan dan issue tindak lanjut.

### Verifikasi

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

### Acceptance criteria

- Seluruh command lulus.
- Build dapat menjalankan health endpoint.
- Runtime lama tetap dapat digunakan sebagai rollback.

---

## 12. Fase 5 — Fondasi Modular Monolith

### Struktur awal

```text
src/
├── app.ts
├── config/
│   ├── env.ts
│   └── paths.ts
├── db/
│   └── client.ts
├── middleware/
│   ├── authenticate.ts
│   ├── authorize.ts
│   ├── error-handler.ts
│   ├── rate-limit.ts
│   └── validate.ts
└── shared/
    ├── app-error.ts
    ├── ids.ts
    └── types.ts
```

### Pekerjaan

1. Validasi environment dengan Zod.
2. Pindahkan pool MySQL ke `src/db/client.ts`.
3. Pindahkan path canonical ke `src/config/paths.ts`.
4. Pindahkan middleware autentikasi dan role.
5. Definisikan tipe principal untuk account dan student.
6. Pisahkan Express app dan HTTP listener.
7. Pastikan centralized error middleware menjadi middleware terakhir.
8. Pertahankan `server.js` sebagai compatibility entry point.

### Acceptance criteria

- Belum ada endpoint bisnis yang berubah.
- Seluruh characterization test tetap lulus.
- Tidak ada pembacaan `process.env` di module bisnis.
- Tidak ada query database di router baru.

---

## 13. Fase 6 — Ekstraksi Module

Setiap subfase adalah satu task atau satu PR.

### Prosedur wajib setiap subfase

1. Identifikasi route legacy yang akan dipindahkan.
2. Buat router, schema, service, repository, dan test.
3. Mount router pada URL yang sama.
4. Hapus hanya deklarasi route legacy yang sudah dipindahkan.
5. Jalankan contract test dan authorization test.
6. Bandingkan response sukses dan error dengan baseline.
7. Jangan lanjut jika parity belum tercapai.

### 13.1 Fase 6A — Auth

Route:

- `POST /api/auth/login`
- `GET /api/auth/verify`
- `POST /api/auth/change-password`
- `POST /api/auth/student-login`

Test tambahan:

- token/account yang sudah dihapus tidak dianggap valid;
- password change merotasi atau mencabut sesi lama sesuai keputusan auth;
- error login tidak mengungkap username mana yang valid.

### 13.2 Fase 6B — Schools dan Accounts

Route:

- `GET /api/schools`
- `POST /api/schools`
- `DELETE /api/schools/:id`
- `GET /api/accounts`
- `POST /api/accounts`
- `PUT /api/accounts/:id/reset-password`
- `DELETE /api/accounts/:id`

Authorization harus diverifikasi dalam service atau repository filter, bukan hanya berdasarkan UI.

### 13.3 Fase 6C — Classes dan Students

Route:

- `GET /api/classes`
- `POST /api/classes`
- `DELETE /api/classes/:id`
- `GET /api/classes/:id/students`
- `POST /api/classes/:id/students/bulk`
- `PUT /api/students/:id/reset-password`
- `DELETE /api/students/:id`
- `GET /api/students/me/results`

Gunakan transaksi untuk bulk insert. Batasi jumlah siswa per request dan validasi panjang setiap field.

### 13.4 Fase 6D — Sessions dan Learning Events

Module `sessions` menangani:

- pembuatan sesi;
- penutupan sesi;
- ownership token;
- transaksi pembuatan user dan session.

Module `learning-events` menangani:

- interactions;
- predictions;
- quiz results.

Semua event harus memvalidasi kepemilikan sesi.

### 13.5 Fase 6E — Scenes dan Objects

Pekerjaan:

- pindahkan CRUD scene;
- pindahkan CRUD object;
- buat filesystem repository;
- validasi JSON scene;
- gunakan atomic write melalui temporary file dan rename;
- pertahankan sinkronisasi data publik sampai build frontend baru siap.

### 13.6 Fase 6F — Tours dan Dataset

Pekerjaan:

- listing tour;
- update identifikasi folder;
- upload dataset;
- statistik dataset;
- validasi MIME berdasarkan isi file;
- batasi ukuran ketika streaming, bukan setelah seluruh body masuk memory;
- cegah filename collision dengan UUID atau atomic counter.

### 13.7 Fase 6G — Reports

Pekerjaan:

- summary;
- CSV export;
- tenant scope terpusat;
- pagination;
- query optimization;
- hitung siswa unik berdasarkan `student_id` untuk siswa login;
- tentukan penanganan guest secara eksplisit.

### 13.8 Fase 6H — Team

Pekerjaan:

- CRUD anggota;
- reorder;
- upload foto;
- validasi image dengan Sharp;
- atomic JSON write;
- hapus file foto lama hanya jika aman dan secara eksplisit disetujui.

### 13.9 Fase 6I — Health dan Static Application

Pisahkan:

- liveness endpoint;
- readiness endpoint database;
- readiness endpoint ML;
- static asset serving;
- frontend fallback.

Health endpoint publik tidak boleh menampilkan daftar file internal atau detail secret/configuration.

### Acceptance criteria Fase 6

- Tidak ada route bisnis tersisa di `server.js`.
- `server.js` hanya menjadi compatibility bootstrap.
- Semua router hanya menangani HTTP concern.
- Semua query berada dalam repository.
- Semua aturan akses memiliki test.

---

## 14. Fase 7 — Migrasi Database Versioned

### Sasaran

Gunakan Drizzle untuk schema dan migration management dengan MySQL/MariaDB yang ada.

### Struktur

```text
src/db/
├── client.ts
├── schema.ts
└── migrations/
```

### Pekerjaan

1. Introspeksi database yang benar-benar digunakan.
2. Cocokkan dengan `db/schema.mysql.sql`.
3. Identifikasi orphan row sebelum menambahkan foreign key.
4. Buat foreign key eksplisit menggunakan `FOREIGN KEY (...) REFERENCES ...`.
5. Tambahkan index untuk seluruh foreign key dan query laporan utama.
6. Tambahkan:
   - `sessions.write_token_hash`;
   - `accounts.must_change_password`.
7. Tentukan kebijakan `RESTRICT`, `CASCADE`, atau `SET NULL` per relasi.
8. Generate SQL migration dan review manual.
9. Jangan menggunakan `drizzle push` ke production.
10. Uji pada:
    - fresh database;
    - snapshot database versi lama;
    - data yang memiliki orphan;
    - proses restore backup.

### Gate manual

Model wajib berhenti sebelum menjalankan migration production dan meminta:

- konfirmasi backup;
- konfirmasi target database;
- konfirmasi maintenance window;
- persetujuan SQL migration.

### Acceptance criteria

- Fresh install menghasilkan schema lengkap.
- Upgrade dari schema lama berhasil.
- Tidak ada orphan setelah migration.
- Restore backup telah diuji.

---

## 15. Fase 8 — Isolasi dan Migrasi ML

### 15.1 Fase 8A — Worker Interface

Struktur:

```text
src/modules/ml/
├── ml.router.ts
├── ml.schema.ts
├── ml.service.ts
├── ml.provider.ts
└── ml.worker.ts
```

Pekerjaan:

1. Jalankan inferensi melalui `worker_threads`.
2. Muat model satu kali per worker.
3. Tambahkan timeout.
4. Batasi panjang antrean.
5. Kembalikan `503` bila worker/model belum siap.
6. Tambahkan graceful shutdown.
7. Cache hasil per tour/node jika input deterministik.

Test:

- API non-ML tetap responsif saat inferensi berjalan.
- Worker crash tidak mematikan API.
- Timeout menghasilkan response terkontrol.
- Antrean berlebih ditolak tanpa kehabisan memory.

### 15.2 Fase 8B — TensorFlow.js ke ONNX

1. Buat golden dataset dari panorama/node yang ada.
2. Rekam output model lama pada environment yang mendukungnya.
3. Konversi model ke ONNX.
4. Jalankan menggunakan `onnxruntime-node`.
5. Bandingkan class, confidence, dan latency.
6. Tentukan tolerance numerik sebelum pengujian.
7. Pertahankan model lama sampai parity lulus.
8. Hapus `@tensorflow/tfjs-node` hanya setelah seluruh test lulus.
9. Jalankan `npm audit` ulang.

### Gate manual

Jika output model berbeda di luar tolerance, model eksekutor harus berhenti. Jangan memilih model baru atau mengubah preprocessing tanpa persetujuan.

---

## 16. Fase 9 — Migrasi Frontend VR

### Sasaran

Gunakan Vite + TypeScript + A-Frame tanpa menulis ulang pengalaman VR.

### Struktur

```text
apps/vr/
├── index.html
├── vr/
├── src/
│   ├── app.ts
│   ├── tour.ts
│   ├── scene-loader.ts
│   ├── api-client.ts
│   └── session-client.ts
└── vite.config.ts
```

### Urutan

1. Replikasi entry HTML tanpa perubahan tampilan.
2. Migrasikan `scene-loader.js`.
3. Migrasikan `app.js`.
4. Migrasikan `tour.js`.
5. Pisahkan session/API client dari rendering VR.
6. Tambahkan mode:
   - `server`: API aktif;
   - `static`: demo GitHub Pages.
7. Gunakan satu sumber asset canonical.
8. Upgrade A-Frame pada task terpisah setelah parity.
9. Jangan migrasikan scene A-Frame ke React.

### E2E minimum

- portal terbuka;
- Prambanan terbuka;
- Borobudur berpindah node;
- informasi geometri terbuka;
- kuis bekerja;
- sesi guest bekerja;
- login siswa bekerja;
- static mode tidak menghasilkan request API gagal tanpa batas;
- smoke test desktop dan mobile.

### Acceptance criteria

- Tampilan dan navigasi utama setara dengan frontend lama.
- Build statis dapat dideploy ke GitHub Pages.
- Build server dapat menggunakan API pada origin yang sama.

---

## 17. Fase 10 — Migrasi Admin

Admin baru dibuat di `/admin-v2`. Jangan mengganti admin lama sekaligus.

### Stack

- React
- Vite
- TypeScript
- React Router
- TanStack Query
- Zod contracts
- cookie `HttpOnly`

### Urutan halaman

1. App shell, login, logout, dan API client.
2. Laporan.
3. Kelas dan siswa.
4. Sekolah dan akun.
5. Scene dan object.
6. Tour dan dataset.
7. Team.
8. Settings.

### Aturan

- Satu kelompok halaman per task.
- Gunakan komponen form dan table bersama hanya setelah ada minimal dua penggunaan.
- Jangan gunakan `dangerouslySetInnerHTML`.
- Jangan menyimpan token baru dalam `localStorage`.
- Semua aksi destructive memiliki confirmation dan error state.
- Semua halaman memiliki loading, empty, dan error state.

### Cutover

1. Jalankan admin lama dan `/admin-v2` secara bersamaan.
2. Lakukan E2E role matrix.
3. Setelah parity, arahkan `/admin` ke build baru.
4. Pertahankan admin lama satu release sebagai rollback.
5. Hapus admin lama pada release berikutnya setelah tidak ada regression.

---

## 18. Fase 11 — Bentuk npm Workspaces

Lakukan setelah backend modular, VR baru, dan admin baru stabil.

### Workspace target

```json
{
  "workspaces": [
    "apps/api",
    "apps/admin",
    "apps/vr",
    "packages/contracts",
    "packages/testing"
  ]
}
```

### Pemindahan

- `src/` ke `apps/api/src/`;
- kontrak Zod ke `packages/contracts/`;
- test helper ke `packages/testing/`;
- pertahankan root `server.js` sebagai shim jika hosting memerlukannya.

### Aturan

- Gunakan satu `package-lock.json`.
- Jangan menghapus `bun.lock` tanpa persetujuan pengguna.
- Pemindahan harus mekanis; jangan mengubah behavior pada PR yang sama.
- Jalankan seluruh test sebelum dan sesudah pemindahan.

### Acceptance criteria

- Root command dapat build seluruh workspace.
- Dependency production dan development terpisah dengan benar.
- Tidak ada import lintas app melalui relative path yang melewati package boundary.

---

## 19. Fase 12 — CI, Deployment, dan Cleanup

### CI wajib

Pipeline menjalankan:

1. `npm ci`;
2. typecheck;
3. lint;
4. unit test;
5. integration test;
6. build;
7. E2E smoke test;
8. dependency audit;
9. artifact verification.

### Deployment

- API berjalan pada Node.js LTS + MySQL.
- Admin build dilayani oleh API pada origin yang sama.
- VR server build dilayani oleh API.
- GitHub Pages menerima hanya static VR build.
- Database migration dijalankan sebagai langkah terpisah setelah backup.
- Readiness harus memisahkan status database dan ML.

### Cleanup

Hapus file hanya setelah `rg` membuktikan tidak ada referensi:

- duplikasi `js/` dan `public/js/`;
- duplikasi CSS;
- duplikasi JSON;
- admin lama;
- SQLite schema lama bila secara resmi tidak dipakai;
- dependency TensorFlow.js Node setelah ONNX tervalidasi.

Jangan menghapus:

- panorama;
- dataset penelitian;
- model yang masih dibutuhkan untuk reproduksibilitas;
- asset Git LFS;
- backup database.

---

## 20. Strategi Test Keseluruhan

### Unit test

Fokus pada:

- validator;
- authorization policy;
- service rules;
- quiz scoring;
- tenant scoping;
- session ownership;
- CSV escaping;
- ML preprocessing.

### Integration test

Fokus pada:

- route + middleware + repository;
- transaksi;
- database constraint;
- migration;
- filesystem atomic write;
- upload validation.

### E2E test

Fokus pada:

- login setiap role;
- pengelolaan sekolah, kelas, dan siswa;
- laporan dan CSV;
- guest/student VR session;
- kuis;
- navigasi scene/tour;
- admin cutover.

### Security regression test

Wajib mencakup:

- stored XSS;
- path traversal;
- broken object-level authorization;
- cross-tenant access;
- brute-force login;
- session event forgery;
- oversized upload;
- invalid MIME;
- error leakage.

## 21. Data, API, dan Configuration Changes

### Perubahan data terencana

- `sessions.write_token_hash`;
- `accounts.must_change_password`;
- foreign key eksplisit;
- index sesuai query utama;
- migration metadata table.

### Perubahan API terencana

- Session creation menambahkan write capability token untuk guest.
- Session event memerlukan capability token atau JWT siswa.
- Quiz result tidak mempercayai `is_correct` dari client.
- Auth mulai mendukung cookie aman selama compatibility Bearer masih aktif.
- URL endpoint lainnya dipertahankan.

### Environment target

Nama final harus ditetapkan dalam `env.ts`, tetapi minimal mencakup:

- database host, port, username, password, dan name;
- application port;
- bootstrap admin password atau bootstrap workflow;
- cookie/session secret;
- allowed origin;
- trust proxy;
- ML model path;
- ML timeout dan queue limit;
- static/server frontend mode.

Jangan memberikan nilai default production untuk secret.

## 22. Risiko dan Mitigasi

| Risiko | Mitigasi |
|---|---|
| Route hilang saat ekstraksi | Route inventory dan contract test pada setiap module |
| Kebocoran data lintas tenant | Authorization policy terpusat dan matrix test |
| Migration merusak data | Backup, dry run, orphan audit, restore rehearsal |
| ML memblokir API | Worker thread, timeout, queue limit, circuit breaker sederhana |
| Perbedaan output ONNX | Golden dataset dan tolerance yang disetujui |
| Frontend lama dan baru drift | Strangler route dan E2E parity sebelum cutover |
| Asset hilang saat cleanup | Referensi `rg`, manifest asset, dan larangan delete LFS |
| Shared hosting tidak mendukung worker/native module | Gate deployment dan fallback service terpisah yang disetujui pengguna |
| Scope migrasi terlalu besar untuk model | Satu subfase per task dan acceptance criteria eksplisit |

## 23. Success Criteria Akhir

Migrasi selesai hanya jika:

- seluruh URL API yang dipertahankan lulus contract test;
- tidak ada route bisnis di entry point;
- backend dapat menyala tanpa ML;
- error async selalu menghasilkan response terkontrol;
- tidak ada akses lintas sekolah atau lintas guru;
- nilai kuis dihitung server;
- seluruh session event memiliki ownership;
- tidak ada data API mentah dieksekusi melalui `innerHTML`;
- fresh database migration berhasil;
- upgrade migration pada snapshot lama berhasil;
- restore backup berhasil diuji;
- admin dan VR lulus E2E desktop/mobile;
- GitHub Pages static demo tetap berfungsi;
- tidak ada critical/high runtime vulnerability yang reachable;
- CI hijau;
- rollback procedure terdokumentasi dan telah diuji.

## 24. Keputusan Manual yang Masih Diperlukan

Model harus meminta keputusan pengguna sebelum fase terkait jika belum tersedia:

1. Konfirmasi npm sebagai package manager final.
2. Apakah `bun.lock` boleh dihapus setelah npm workspaces stabil.
3. Apakah GitHub Pages tetap dipertahankan sebagai demo statis.
4. Versi MySQL/MariaDB production.
5. Apakah data guest masuk laporan penelitian resmi.
6. Apakah guest boleh memilih sekolah tanpa autentikasi.
7. Domain/origin production untuk cookie.
8. Kemampuan hosting menjalankan worker thread dan ONNX native binding.
9. Tolerance output yang diterima untuk migrasi TFJS ke ONNX.
10. Maintenance window dan backup sebelum migration production.

## 25. Template Prompt untuk Model Eksekutor

Salin template berikut dan ganti placeholder fase:

```text
Kerjakan hanya Fase <nomor dan nama> dari plan-migration.md pada project VR-GeoNusa.

Aturan:
1. Baca seluruh bagian fase aktif, aturan eksekusi global, dan acceptance criteria.
2. Jangan mengerjakan fase berikutnya.
3. Periksa git status terlebih dahulu dan pertahankan semua perubahan pengguna.
4. Jangan mengubah URL atau response API kecuali diwajibkan fase.
5. Jangan menghapus file legacy, data, model, panorama, atau asset Git LFS.
6. Tambahkan atau perbarui test untuk setiap perubahan behavior.
7. Jalankan semua verification yang disebutkan pada fase.
8. Jika keputusan tidak ditentukan oleh plan, berhenti dan tanyakan kepada pengguna.
9. Jangan menganggap task selesai bila test gagal.
10. Setelah selesai, laporkan:
   - file yang berubah;
   - behavior yang berubah;
   - test/verification yang dijalankan dan hasilnya;
   - risiko dan pekerjaan tersisa;
   - apakah acceptance criteria fase telah terpenuhi.
```

## 26. Format Laporan Setiap Fase

```markdown
### Fase yang dikerjakan

<nomor dan nama fase>

### File berubah

- path/file

### Perubahan behavior

- perubahan atau "tidak ada"

### Verification

- command: hasil

### Acceptance criteria

- [x] kriteria terpenuhi
- [ ] kriteria belum terpenuhi — alasan

### Risiko tersisa

- risiko

### Rekomendasi langkah berikutnya

Berhenti. Jangan otomatis mengerjakan fase berikutnya.
```

