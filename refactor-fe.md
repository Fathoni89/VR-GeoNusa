# Rencana Refactor Frontend `public/` ke React

## Pendekatan yang direkomendasikan

Lakukan migrasi bertahap per entry point, bukan menulis ulang seluruh frontend sekaligus. Sumber aplikasi React ditempatkan di `frontend/`, kemudian dibundle dengan `esbuild` yang sudah menjadi dependency proyek ke `public/build/`. Folder `public/` tetap menjadi direktori yang dilayani Express dan menyimpan shell HTML, CSS, data, model ML, serta media statis.

Urutan migrasi yang disarankan adalah portal, admin, scene VR, lalu tur 360°. Setiap halaman baru menggantikan halaman legacy hanya setelah lulus pemeriksaan parity. URL publik, payload API, data JSON, tampilan utama, dan kemampuan fallback statis dipertahankan selama migrasi.

React bertanggung jawab atas UI, state, form, loading, error, modal, serta akses berbasis peran. A-Frame, WebXR, canvas, dan TensorFlow.js tetap bekerja secara imperative melalui adapter kecil karena library tersebut memang memiliki lifecycle DOM/WebGL sendiri. Tidak perlu menambahkan Redux, React Router, React Query, atau design system baru untuk cakupan saat ini.

## Ruang lingkup dan asumsi

Ruang lingkup wajib mencakup seluruh frontend aktif di bawah `public/`:

- portal utama pada `/`;
- panel admin pada `/admin` dan `/admin/login`;
- scene VR pada `/vr/prambanan.html` dan `/vr/{scene_id}.html`;
- tur 360° pada `/vr/tour-borobudur.html`;
- alur login staf/siswa, sesi belajar, hasil belajar, kuis, laporan, pengelolaan scene/objek/tur/sekolah/akun/kelas/tim, dataset capture, dan prediksi ML yang saat ini tersedia.

Asumsi implementasi:

- refactor tidak mengubah skema database atau aturan otorisasi backend;
- seluruh endpoint dan bentuk payload API yang sekarang dipakai frontend dipertahankan;
- CSS yang ada digunakan kembali pada fase awal agar migrasi tidak sekaligus menjadi redesign;
- URL publik lama dan fallback data statis tetap kompatibel;
- file besar seperti panorama dan model ML tidak dipindahkan atau dibundle;
- perubahan visual hanya diperbolehkan untuk memperbaiki aksesibilitas atau state UI yang tidak konsisten, bukan mengubah identitas desain.

## Bukti kondisi repository saat ini

| Lokasi | Kondisi saat ini | Implikasi refactor |
|---|---|---|
| `public/index.html` | Portal sekitar 31 KB; markup dan script DOM/fetch masih berada dalam satu HTML. | Diubah menjadi shell `<div id="root">` dan entry React portal, dengan class CSS lama tetap dipakai. |
| `public/admin/index.html` | Monolit sekitar 116 KB yang berisi CSS, markup, state global, auth, navigasi, sebelas halaman fitur, modal, dan pemanggilan API. | Harus dipecah berdasarkan halaman/fitur, tetapi tidak dibuat menjadi framework internal baru. |
| `public/js/app.js` | Mengelola scene Prambanan, login siswa, sesi, hasil, interaksi, prediksi, dan kuis dengan mutasi DOM langsung. | UI/session dipindah ke React; operasi A-Frame dipindah ke adapter. |
| `public/js/tour.js` | Mengelola tur panorama, hotspot, ML browser/server, auth siswa, sesi, hasil, kuis, dan dataset capture. | Logika bersama disatukan dengan scene VR; renderer panorama dan ML tetap terisolasi sebagai adapter. |
| `public/js/scene-loader.js` | Membuat entity A-Frame dari dokumen scene JSON. | Algoritma dipertahankan dan dipindah menjadi modul adapter bertipe. |
| `public/js/html-sanitize.js` | Digunakan karena HTML legacy merender string melalui `innerHTML`. | React menangani escaping teks; validasi URL foto/link tetap dipertahankan sebagai helper khusus. |
| `public/vr/*.html` | Memuat A-Frame/TensorFlow dari CDN, banyak handler inline, dan struktur UI yang dimutasi script global. | Menjadi shell tanpa inline handler; bundle React self-hosted tetap memuat dependency WebXR/ML yang diperlukan. |
| `server.js` (`generateVrPage`) | Membuat satu dokumen HTML legacy lengkap untuk setiap scene baru. | Diperkecil menjadi renderer shell React; perilaku membuat `/vr/{scene_id}.html` tetap ada. |
| `src/modules/scenes/scenes.service.ts` dan `scenes.repository.ts` | Pembuatan scene menulis JSON publik dan file HTML VR; penghapusan scene menghapus keduanya. | Kontrak ini dipertahankan agar URL lama dan hosting statis tidak rusak. |
| `src/static-application.ts` | Melayani `/`, `/admin`, `/admin/login`, isi `public`, data canonical, dan fallback portal. | Tidak perlu routing frontend baru; response lama harus tetap lulus test. |
| `src/build/copy-runtime-assets.ts` | Menyalin seluruh `public` ke `dist` setelah kompilasi backend. | Build React harus selesai sebelum tahap copy ini. |
| `package.json` | `esbuild`, TypeScript, ESLint, dan Vitest sudah ada; React belum ada. | Gunakan `esbuild`; tambahkan hanya React, React DOM, type React, dan dependency test DOM yang benar-benar dibutuhkan. |
| `public/css/kids.css` dan `public/css/ui.css` | Seluruh desain portal/VR sudah tersedia sebagai CSS statis; CSS admin masih tertanam dalam HTML. | Pakai kembali CSS ini; ekstrak CSS admin ke `public/css/admin.css`. |
| `tests/unit/*` dan `tests/security/*` | Sejumlah test memeriksa potongan source legacy seperti nama fungsi, `innerHTML`, dan isi inline script. | Ganti dengan test perilaku React dan kontrak keamanan, bukan menyalin pola source lama. |

## Struktur target

Struktur berikut adalah target awal, bukan kewajiban membuat file kosong untuk setiap kemungkinan fitur:

```text
frontend/
  entries/
    portal.tsx
    admin.tsx
    scene-vr.tsx
    tour-vr.tsx
  shared/
    api.ts
    api-types.ts
    safe-url.ts
  portal/
    PortalApp.tsx
  admin/
    AdminApp.tsx
    auth/
    pages/
  learning/
    student-auth.ts
    learning-session.ts
    quiz.ts
  vr/
    SceneVrApp.tsx
    TourVrApp.tsx
    aframe-scene-adapter.ts
    panorama-adapter.ts
    ml-adapter.ts
  global.d.ts
public/
  index.html
  admin/index.html
  vr/prambanan.html
  vr/tour-borobudur.html
  css/
  data/
  assets/
  ml-model/
  build/                 # output esbuild; bukan source
scripts/
  build-frontend.mjs
tsconfig.frontend.json
```

Pemisahan file di `admin/pages/` mengikuti halaman nyata yang sudah ada: objek, scene, tur, kelas/siswa, laporan, sekolah/akun, katalog geometri, export, pengaturan, dan tim. Komponen hanya diekstrak lebih jauh bila benar-benar dipakai ulang atau ukurannya menghalangi pemahaman.

## Langkah implementasi

### 1. Bekukan baseline perilaku frontend

**Aksi**

- Buat checklist parity dari seluruh entry point dan peran: guest, student, teacher, `school_admin`, dan `super_admin`.
- Catat response loading, kosong, gagal, sukses, konfirmasi delete, kewajiban ganti password, dan perilaku saat token tidak valid.
- Ambil screenshot desktop dan mobile untuk portal, login/admin, scene Prambanan, serta tur Borobudur.
- Catat kontrak yang tidak boleh berubah: URL, endpoint, key local storage yang masih diperlukan, session ownership header, fallback API ke JSON, dan link export/download.

**Lokasi terkait**: `public/index.html`, `public/admin/index.html`, `public/js/app.js`, `public/js/tour.js`, `public/vr/*.html`, `tests/`.

**Dependency**: tidak ada.

**Verifikasi**: checklist mencakup setiap fungsi publik yang ditemukan di frontend legacy dan menjadi acceptance matrix untuk fase berikutnya.

### 2. Tambahkan toolchain React dengan perubahan minimum

**Aksi**

- Tambahkan runtime dependency `react` dan `react-dom`; tambahkan type package React serta environment test DOM yang diperlukan sebagai dev dependency.
- Gunakan `esbuild` yang sudah terpasang. Buat `scripts/build-frontend.mjs` untuk empat entry TSX, source map, splitting shared chunk, nama output stabil untuk entry, dan pembersihan yang dibatasi hanya pada `public/build/`.
- Tambahkan `tsconfig.frontend.json` dengan `strict`, DOM library, dan JSX React; jalankan bersama typecheck backend tanpa mencampur konfigurasi Node dan browser.
- Perluas ESLint agar memeriksa `frontend/**/*.ts` dan `frontend/**/*.tsx`, termasuk aturan hooks. Jangan menambahkan plugin React lain bila aturan yang dibutuhkan sudah tercakup oleh ESLint/TypeScript.
- Tambahkan script `frontend:build` dan `frontend:watch`; masukkan `frontend:build` sebelum `copy-runtime-assets` pada `npm run build`.
- Abaikan `public/build/` dari Git. Pada Docker, jalankan build frontend setelah source disalin dan sebelum image dijalankan. Untuk pengembangan, dokumentasikan backend watch dan frontend watch sebagai dua proses; jangan membuat supervisor custom hanya untuk menyatukan terminal.
- Ubah keempat HTML menjadi shell yang memuat stylesheet lama dan bundle `type="module"` masing-masing. Pada tahap ini, shell dapat tetap berdampingan dengan implementasi legacy sampai entry React pertama siap cutover.

**Lokasi terkait**: `package.json`, `package-lock.json`, `eslint.config.js`, `.gitignore`, `Dockerfile`, `scripts/build-frontend.mjs`, `tsconfig.frontend.json`, `public/**/*.html`.

**Dependency**: baseline fase 1.

**Verifikasi**: build menghasilkan empat entry tanpa menyentuh `public/data`, `public/assets`, `public/ml-model`, atau upload tim; `npm run typecheck`, lint frontend, build backend, dan start dari `dist` berhasil.

### 3. Bentuk kontrak API dan state bersama

**Aksi**

- Definisikan hanya type response/request yang benar-benar digunakan UI di `frontend/shared/api-types.ts`; jangan membuat client generator atau menyalin seluruh schema backend.
- Buat `requestJson`/`requestBlob` same-origin yang menangani JSON gagal, response non-JSON, abort, dan status 401 secara konsisten.
- Untuk admin, gunakan mode cookie HttpOnly yang sudah didukung `/api/auth/login` melalui `X-Auth-Mode: cookie`; React tidak lagi menyimpan token staf di `localStorage`. `verify`, `logout`, dan seluruh admin API memakai cookie same-origin. Username, role, school ID, dan `must_change_password` berasal dari response/verify, bukan dipercaya dari local storage.
- Pertahankan token siswa dan session write token hanya di memory. Session write token tetap dikirim melalui `X-Session-Token` untuk guest, sedangkan siswa memakai Bearer token. Jangan pernah menyimpan session write token ke storage.
- Pertahankan token dataset sesuai alur login dataset yang terpisah; jangan mengandalkan token admin panel setelah admin berpindah ke cookie.
- Satukan alur sesi, hasil belajar, dan payload kuis yang kini terduplikasi di `app.js` dan `tour.js`. Server tetap menjadi sumber kebenaran penilaian kuis; client tidak mengirim `is_correct`.

**Lokasi terkait**: `frontend/shared/*`, `frontend/learning/*`, `src/modules/auth/auth.router.ts`, `tests/security/browser-security.test.mjs`, `tests/unit/session-client-contract.test.mjs`.

**Dependency**: toolchain fase 2.

**Verifikasi**: test membuktikan cookie admin, reset state pada 401/logout, forced password change, token sesi hanya di memory, header ownership benar, dan payload kuis tidak memuat hasil penilaian client.

### 4. Migrasikan portal utama

**Aksi**

- Pindahkan markup portal ke `PortalApp.tsx` menggunakan semantic HTML dan class `kids.css` yang sama.
- Ubah statistik scene/objek dan daftar tim menjadi komponen React dengan state loading/error/empty.
- Pertahankan fallback tim dari `/api/team` ke `/data/team.json` untuk mode statis.
- Render semua data API sebagai text node React. Helper URL tetap membatasi foto tim ke path/URL yang diizinkan; external link tetap memakai `rel="noopener noreferrer"`.
- Implementasikan nav scroll, smooth anchor, dan reveal dengan effect yang memiliki cleanup; hormati `prefers-reduced-motion`.
- Hapus inline script dan referensi `html-sanitize.js` dari portal setelah parity lulus.

**Lokasi terkait**: `frontend/entries/portal.tsx`, `frontend/portal/PortalApp.tsx`, `public/index.html`, `public/css/kids.css`.

**Dependency**: fase 2 dan API client fase 3.

**Verifikasi**: screenshot baseline setara; statistik dan tim tampil dari API maupun fallback; keyboard navigation, focus state, alt text, reduced motion, dan mobile layout tetap berfungsi.

### 5. Migrasikan panel admin per halaman

**Aksi**

- Buat `AdminApp` yang memiliki tiga state tingkat aplikasi: pemeriksaan auth, login, dan authenticated shell.
- Gunakan state/reducer React untuk halaman aktif, scene aktif, role, `must_change_password`, modal, dan toast. Simpan hanya preferensi tidak sensitif yang bermanfaat, misalnya scene terakhir.
- Implementasikan guard UI dari role yang sekarang: guru hanya laporan/pengaturan, admin sekolah hanya cakupan yang diizinkan, dan super admin memiliki seluruh halaman. Backend tetap menjadi penegak otorisasi sebenarnya.
- Migrasikan halaman satu per satu dalam urutan dependency: login/pengaturan, layout/nav, scene+objek, tur, kelas+siswa, laporan+CSV, sekolah+akun, tim, lalu katalog/export.
- Pertahankan API endpoint dan payload saat ini. CSV tetap diunduh melalui authenticated fetch lalu Blob, bukan link tanpa kredensial.
- Ganti `confirm`, prompt password, dan modal legacy dengan komponen dialog yang memiliki label, focus management, tombol batal, dan pencegahan submit ganda. Jangan membuat library modal/form generik di luar kebutuhan nyata.
- Ekstrak CSS `<style>` admin ke `public/css/admin.css`; pertahankan class dan visual baseline sebelum melakukan cleanup CSS.
- Cutover `/admin` hanya setelah seluruh halaman dan ketiga role lulus parity; kemudian hapus inline script admin dan dependensi `html-sanitize.js` dari shell.

**Lokasi terkait**: `frontend/entries/admin.tsx`, `frontend/admin/**/*`, `public/admin/index.html`, `public/css/admin.css`.

**Dependency**: auth/API fase 3.

**Verifikasi**: test komponen untuk auth, forced password change, role visibility, CRUD utama, 401, error/empty/loading, CSV Blob, modal keyboard, dan data API berbahaya yang harus tampil sebagai teks biasa.

### 6. Migrasikan scene VR umum tanpa melawan lifecycle A-Frame

**Aksi**

- Buat `SceneVrApp` untuk splash/login, HUD, info geometri, hasil siswa, dan kuis.
- Render container A-Frame dari React, tetapi tempatkan pembuatan entity, event `loaded`, fuse/click, raycaster, dan cleanup listener dalam `aframe-scene-adapter.ts`. Adapter menerima data dan callback; adapter tidak mengubah elemen UI React.
- Pindahkan algoritma `buildAFrameEntity` dari `scene-loader.js` tanpa mengubah hasil geometri/material/model.
- Ambil `scene_id` dari attribute aman pada root shell. Muat `/api/scenes/{scene_id}` terlebih dahulu lalu fallback ke `/data/{scene_id}.json` seperti perilaku saat ini.
- Pindahkan `generateVrPage` dari `server.js` menjadi renderer tipis di `src/modules/scenes/scenes.renderer.ts`. Renderer hanya menghasilkan metadata, root dengan `data-scene-id`, tag A-Frame CDN, stylesheet, dan bundle React; tidak ada inline state atau handler.
- Pertahankan `ScenesRepository.writeVr/delete` dan `vr_url` `/vr/{scene_id}.html`, sehingga scene buatan admin serta hosting statis tetap bekerja. `public/vr/prambanan.html` menggunakan shell yang sama.
- Pastikan adapter menghentikan session dan melepas event listener saat unmount/page unload tanpa menulis dua event akhir.

**Lokasi terkait**: `frontend/entries/scene-vr.tsx`, `frontend/vr/SceneVrApp.tsx`, `frontend/vr/aframe-scene-adapter.ts`, `public/vr/prambanan.html`, `server.js`, `src/modules/scenes/scenes.renderer.ts`, `src/modules/scenes/scenes.service.ts`.

**Dependency**: learning session fase 3.

**Verifikasi**: Prambanan dan satu scene hasil create admin dapat dibuka pada URL lama; fallback JSON bekerja tanpa API; entity interaktif, fuse, info, kuis, hasil siswa, session ownership, dan delete scene tetap benar.

### 7. Migrasikan tur 360° dan ML

**Aksi**

- Buat `TourVrApp` untuk splash/login, area jump, HUD, area info, geometri, hasil siswa, kuis, dan dataset panel.
- Pindahkan perpindahan node, hotspot, kamera, panorama cache, crop equirectangular, dan canvas capture ke `panorama-adapter.ts` dengan API kecil yang mengikuti kebutuhan UI nyata.
- Pindahkan prediksi ke `ml-adapter.ts` dengan urutan yang sama: server lebih dahulu, TensorFlow.js browser sebagai fallback, lalu data identifikasi admin bila model tidak tersedia.
- Pertahankan sumber `/data/tour-borobudur.json`, `/data/geometry-labels.json`, `/data/quiz.json`, model `/ml-model/*`, header provenance dataset, dan URL upload dataset.
- Pertahankan navigasi keyboard, perpindahan hotspot, fade, serta event logging. Effect React wajib menghapus keydown, unload, A-Frame, dan timer listener ketika unmount.
- Ubah `public/vr/tour-borobudur.html` menjadi shell React tanpa inline handler setelah parity.

**Lokasi terkait**: `frontend/entries/tour-vr.tsx`, `frontend/vr/TourVrApp.tsx`, `frontend/vr/panorama-adapter.ts`, `frontend/vr/ml-adapter.ts`, `public/vr/tour-borobudur.html`.

**Dependency**: session/quiz fase 3 dan pola adapter fase 6.

**Verifikasi**: seluruh 60 node/12 area dapat dinavigasi; hotspot dan jump menu konsisten; ML server/browser/admin fallback teruji; dataset capture mengirim header provenance; keyboard, desktop, mobile, dan WebXR smoke test lulus.

### 8. Hapus legacy dan perketat keamanan

**Aksi**

- Setelah semua entry sudah cutover, hapus `public/js/app.js`, `public/js/tour.js`, `public/js/scene-loader.js`, dan `public/js/html-sanitize.js` bila tidak ada referensi tersisa.
- Pastikan tidak ada `onclick`, `onchange`, atau inline `<script>` pada shell frontend.
- Perketat CSP `script-src` dan `script-src-attr` setelah semua inline script hilang. Pertahankan origin A-Frame/TensorFlow yang masih diperlukan. `style-src 'unsafe-inline'` hanya dipertahankan bila pengujian membuktikan A-Frame membutuhkannya, dan alasannya didokumentasikan.
- Hapus selector CSS mati hanya setelah seluruh screenshot parity selesai; jangan menggabungkan cleanup visual besar dengan cutover perilaku.
- Perbarui README, `CARA-MENJALANKAN.md`, dan panduan penggunaan untuk perintah frontend build/watch dan struktur baru.

**Lokasi terkait**: `public/js/*`, `public/**/*.html`, `server.js` Helmet config, dokumentasi proyek.

**Dependency**: fase 4–7 selesai.

**Verifikasi**: `rg` tidak menemukan referensi asset legacy atau inline handler; CSP tidak lagi mengizinkan inline script; seluruh test dan smoke test tetap lulus.

## Perubahan data, API, dan konfigurasi

### Data dan database

- Tidak ada migrasi database.
- Format `data/*.json`, `public/data/*.json`, panorama, model ML, dan upload foto tim tetap sama.
- Build frontend hanya boleh membersihkan `public/build/`; direktori runtime yang dapat ditulis aplikasi tidak boleh ikut dibersihkan.

### API

- Tidak ada endpoint atau payload bisnis yang diubah.
- `/api/auth/login` memakai kemampuan cookie yang sudah ada untuk admin React; alur token siswa dan dataset tetap eksplisit sesuai kebutuhan masing-masing.
- `POST /api/scenes` tetap mengembalikan `vr_url` berbentuk `/vr/{scene_id}.html`.
- Generator scene masih menulis file HTML, tetapi hasilnya hanya shell React bersama, bukan aplikasi legacy yang diduplikasi per scene.

### Build dan deployment

- Tambah output `public/build/` dan source `frontend/`.
- `npm run build` wajib membundle frontend sebelum `public` disalin ke `dist`.
- Docker image wajib membangun frontend; jangan bergantung pada bundle hasil commit.
- `npm start` dari checkout bersih harus memiliki langkah build frontend yang terdokumentasi atau otomatis melalui lifecycle script yang terarah.

## Strategi test dan verifikasi

### Test otomatis minimum

- **API client/auth**: response sukses/gagal/non-JSON, 401, cookie login/verify/logout, forced password change.
- **Session**: guest memakai `X-Session-Token`, siswa memakai Bearer, token sesi tidak masuk storage, end session idempotent dari sisi client.
- **Quiz**: client mengirim `question_id`, `answer`, dan waktu respons tanpa `is_correct`.
- **Portal**: statistik, fallback tim, empty/error state, URL foto berbahaya ditolak, text API di-escape React.
- **Admin**: visibility tiap role, redirect paksa ke pengaturan, CRUD kritis, konfirmasi delete, bulk student result, CSV authenticated Blob.
- **VR adapter**: entity dibuat dari scene JSON, event listener terpasang/dilepas, callback interaksi tepat satu kali.
- **Tour adapter**: perpindahan node/hotspot, ML fallback order, dataset provenance headers.
- **Static application**: `/`, `/admin`, `/admin/login`, `/vr/prambanan.html`, `/vr/tour-borobudur.html`, scene hasil generate, static asset, canonical `/data`, dan fallback tetap benar.
- **Security**: malicious API text tidak menjadi markup, URL scheme tidak aman ditolak, shell tanpa inline script, dan CSP sesuai bundle React.

Test inspeksi source legacy berikut harus diganti, bukan dipertahankan secara artifisial:

- `tests/unit/bootstrap-admin-ui.test.mjs`;
- `tests/unit/session-client-contract.test.mjs`;
- bagian client pada `tests/unit/tours-dataset-module.test.ts`;
- `tests/unit/scene-renderer-security.test.ts` disesuaikan untuk shell React;
- assertion HTML legacy pada `tests/security/known-gaps.test.mjs` dan `tests/security/browser-security.test.mjs`.

### Gate per fase

Jalankan gate terkecil setelah setiap entry, lalu gate penuh sebelum menghapus legacy:

```text
npm run typecheck
npm run lint
npm test
npm run build
npm run start:build
```

Lakukan smoke test browser pada ukuran desktop dan mobile. Scene/tur juga perlu pemeriksaan nyata untuk mouse, keyboard, touch, mode VR headset bila perangkat tersedia, dan kondisi model ML/server tidak siap.

## Risiko dan mitigasi

| Risiko | Mitigasi |
|---|---|
| React dan A-Frame sama-sama memutasi subtree DOM sehingga entity hilang atau event ganda. | React memiliki shell/UI; adapter memiliki subtree scene dan seluruh listener. Gunakan ref dan cleanup eksplisit, bukan query DOM global lintas fitur. |
| Build menghapus data runtime, panorama, model, atau foto hasil upload. | Bersihkan hanya path absolut tervalidasi `public/build/`; jangan memakai empty-out-dir terhadap seluruh `public`. |
| Scene buatan admin tidak lagi memiliki halaman sendiri. | Pertahankan renderer/repository HTML, tetapi hasilkan shell React tipis yang membaca `data-scene-id`. |
| Refactor admin mengubah aturan role secara tidak sengaja. | Tulis matrix test kelima role/guest; UI hanya menyembunyikan fitur, backend tetap menegakkan scope. |
| Token staf tetap rentan dicuri bila disimpan di local storage. | Gunakan mode cookie HttpOnly backend yang sudah tersedia dan hilangkan token staf dari storage pada React admin. |
| React otomatis meng-escape teks tetapi URL berbahaya masih dapat lolos. | Pertahankan allowlist/path validation khusus URL; jangan memakai `dangerouslySetInnerHTML`. |
| CSP rusak karena bundle, CDN A-Frame, TensorFlow, worker, canvas, atau blob. | Pertahankan directive yang dibutuhkan selama cutover, uji setiap entry, lalu hapus hanya izin inline script yang tidak lagi diperlukan. |
| Fallback GitHub Pages hilang. | Gunakan path asset relatif pada shell VR dan pertahankan fallback API ke JSON statis. |
| Perubahan besar sulit dirollback. | Cutover satu entry per commit; simpan asset legacy sampai entry tersebut lulus parity, lalu hapus pada fase terakhir. |

## Kriteria keberhasilan

Refactor dinyatakan selesai bila:

- keempat entry point dirender React dan tidak bergantung pada handler/script global legacy;
- URL `/`, `/admin`, `/admin/login`, `/vr/prambanan.html`, `/vr/tour-borobudur.html`, dan `/vr/{scene_id}.html` tetap bekerja;
- seluruh fitur pada acceptance matrix dapat dijalankan oleh role yang benar dan ditolak backend untuk role yang salah;
- scene yang dibuat dari admin menghasilkan shell VR valid dan scene yang dihapus membersihkan JSON/HTML seperti sebelumnya;
- guest/student session, hasil belajar, kuis, laporan, CSV, dataset capture, dan fallback ML berfungsi tanpa perubahan kontrak API;
- tidak ada token staf atau session write token tersimpan di local storage;
- tidak ada `dangerouslySetInnerHTML`, inline event handler, atau inline script aplikasi;
- `public/build/` dapat dibuat dari checkout bersih dan build tidak menyentuh data/media runtime;
- typecheck, lint, seluruh test, build, startup `dist`, browser smoke test, dan pemeriksaan WebXR yang tersedia lulus;
- dokumentasi menjalankan dan membangun frontend sudah diperbarui.

## Keputusan implementasi yang perlu dikunci sebelum mulai

Rekomendasi default berikut sudah dipakai dalam rencana dan hanya perlu diubah bila ada kebutuhan produk yang berbeda:

1. Pertahankan seluruh URL lama; jangan memperkenalkan React Router pada fase ini.
2. Gunakan `esbuild` yang sudah ada, bukan menambah Vite.
3. Gunakan TypeScript/TSX strict untuk source React.
4. Gunakan cookie HttpOnly yang sudah didukung backend untuk admin React.
5. Pertahankan tampilan/CSS saat ini; redesign dilakukan sebagai pekerjaan terpisah setelah parity.
6. Pertahankan A-Frame dan TensorFlow.js sebagai adapter imperative/CDN pada fase ini; jangan mengganti engine VR atau pipeline ML.

