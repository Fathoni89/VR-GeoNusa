# Cara Menjalankan VR-GeoNusa di Lokal

## Prasyarat

Pastikan **Node.js 22 LTS** dan **MySQL/MariaDB** sudah terinstal. Cek Node.js dengan membuka Terminal dan ketik:

```
node --version
```

Jika muncul angka versi `v22.x.x`, berarti sudah siap. Jika belum, unduh di https://nodejs.org.

---

## Langkah-Langkah

### 1. Buka Terminal

Di Mac: tekan **Cmd + Spasi**, ketik `Terminal`, lalu tekan Enter.

### 2. Masuk ke Folder Project

```bash
cd ~/VR-GeoNusa
npm install
```

### 3. Jalankan Aplikasi dan Database dengan Docker (direkomendasikan untuk lokal)

Pastikan Docker Desktop sudah berjalan. Siapkan konfigurasi terlebih dahulu:

```bash
cp .env.example .env
# isi DB_USER, DB_PASSWORD, DB_NAME, dan BOOTSTRAP_ADMIN_PASSWORD
```

Kemudian jalankan:

```bash
docker compose up -d --build
```

Compose akan menjalankan aplikasi Node.js di `http://localhost:4000`, membuat
database MySQL, dan menyimpan data database di volume persisten
`vr-geonusa-mysql-data`. Konfigurasi koneksi dibaca dari file `.env`.

Untuk menghentikan aplikasi dan database tanpa menghapus data:

```bash
docker compose stop
```

Jika ingin menjalankan aplikasi dengan Node.js di Windows dan hanya database
yang memakai Docker, jalankan `docker compose up -d database`, lalu lanjutkan
ke langkah 4. Catatan: modul native TensorFlow.js mungkin memerlukan toolchain
C++ tambahan pada versi Node.js tertentu di Windows.

### 3b. Siapkan Database tanpa Docker

Buat database MySQL/MariaDB kosong beserta user-nya, lalu salin `.env.example` menjadi `.env` dan isi kredensialnya:

```bash
cp .env.example .env
# edit .env — isi DB_HOST, DB_USER, DB_PASSWORD, DB_NAME,
# dan BOOTSTRAP_ADMIN_PASSWORD untuk database kosong atau upgrade admin legacy
```

Tabel dan akun `admin` bootstrap dibuat **otomatis** saat server pertama kali
jalan. Password awal dibaca dari `BOOTSTRAP_ADMIN_PASSWORD` dan wajib diganti
setelah login pertama. Tidak perlu import file `.sql` manual (kecuali untuk
deploy produksi, lihat bagian bawah).

Pada upgrade dari versi yang masih memakai password admin tetap, startup
pertama juga merotasi akun `admin` ke `BOOTSTRAP_ADMIN_PASSWORD` dan mewajibkan
penggantian password. Setelah migrasi atau bootstrap berhasil, nilai environment
tersebut boleh dihapus dari konfigurasi runtime.

### 4. Jalankan Server

```bash
node server.js
```

Untuk memverifikasi dan membuat build campuran JavaScript/TypeScript:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

Build tersimpan di `dist/` dan dapat dijalankan dengan `npm run start:build`.
Perintah `node server.js` tetap menjadi entry point legacy untuk rollback.

Jika berhasil, akan muncul pesan seperti ini:

```
🏛️  VR-GeoNusa Server v2.0 (MySQL + multi-sekolah + ML server-side)
   Portal   → http://localhost:4000
   Admin    → http://localhost:4000/admin
   API      → http://localhost:4000/api/scenes
   DB       → nama_database@localhost
```

### 5. Buka di Browser

| Halaman       | Alamat                          |
|---------------|---------------------------------|
| Portal Utama  | http://localhost:4000           |
| Admin Panel   | http://localhost:4000/admin     |

**Login admin pertama:** username `admin`, dengan password yang Anda isi pada
`BOOTSTRAP_ADMIN_PASSWORD`.

---

## Menghentikan Server

Tekan **Ctrl + C** di jendela Terminal tempat server berjalan.

---

## Troubleshooting

**Port 4000 sudah dipakai (error `EADDRINUSE`)**

Matikan proses yang memakai port tersebut lalu jalankan ulang:

```bash
kill $(lsof -ti:4000)
node server.js
```

**Pesan "Cannot find module"**

Dependensi belum terinstal. Jalankan sekali:

```bash
npm install
node server.js
```

**Server jalan tapi browser tidak bisa buka**

Pastikan URL-nya `http://` (bukan `https://`) dan port-nya `4000`.

**Error koneksi database (`ECONNREFUSED` / `ER_ACCESS_DENIED_ERROR`)**

Pastikan MySQL/MariaDB sedang jalan dan kredensial di `.env` (`DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`) sudah benar dan database-nya sudah dibuat (boleh kosong — tabel dibuat otomatis).

---

## Deploy ke Rumahweb Medium (Hosting Produksi)

Backend project ini (Express + MySQL/MariaDB — login multi-sekolah, CRUD scene, tur 360°, ML server-side, log sesi siswa, kuis, laporan guru) butuh Node.js yang **jalan terus** dan database MySQL, bukan cuma file statis. Paket **Rumahweb Unlimited S tidak mendukung ini** — hanya paket **Medium ke atas** yang menyediakan akses SSH + Node.js + MySQL. Langkah umum setelah akun Medium aktif:

### 1. Buat database MySQL di cPanel

Buat database + user MySQL lewat panel Rumahweb (MySQL Databases), lalu catat nama database, username, dan password-nya — dipakai di langkah 4.

### 2. Upload kode ke server

Lewat SSH (`git clone` repo ini) atau upload manual via File Manager/FTP. **Yang tidak perlu ikut diupload:** `MLTraining/venv/` dan `node_modules/` (besar, dan dibuat ulang di server), juga `Dataset/geometry_wbn/train|val|test/` (dataset training mentah, bukan bagian aplikasi yang jalan).

### 3. Install dependency di server

```bash
cd vr-geonusa
npm install --omit=dev
```

### 4. Konfigurasi `.env`

```bash
cp .env.example .env
# edit .env — isi DB_HOST, DB_USER, DB_PASSWORD, DB_NAME sesuai database,
# serta BOOTSTRAP_ADMIN_PASSWORD untuk database kosong atau upgrade admin legacy
```

Tabel dibuat otomatis saat server pertama kali jalan. Pada database kosong,
akun `super_admin` bernama `admin` memakai password awal dari
`BOOTSTRAP_ADMIN_PASSWORD` dan **wajib menggantinya setelah login pertama**.
Upgrade dari versi lama akan merotasi akun `admin` dengan nilai environment yang
sama tepat satu kali.

### 5. Jalankan sebagai proses yang tidak mati

Server biasa (`node server.js`) akan mati begitu koneksi SSH ditutup. Pakai **PM2** supaya tetap jalan di background dan otomatis restart kalau server reboot:

```bash
npm install -g pm2
pm2 start server.js --name vr-geonusa
pm2 save
pm2 startup   # ikuti instruksi yang muncul, sekali saja
```

### 6. Sesuaikan port

Rumahweb biasanya menetapkan port tertentu untuk aplikasi Node (lihat panel "Setup Node.js App" di cPanel Rumahweb). `server.js` sudah membaca `process.env.PORT`, jadi tinggal set env var itu sesuai yang diberikan panel — tidak perlu ubah kode.

### 7. Yang harus dijaga saat update/deploy ulang

- **Database MySQL** — bukan file lokal, jadi aman dari proses upload ulang kode. Tetap **backup berkala** (`mysqldump`) sebelum perubahan besar.
- `.env` dan `config/jwt-secret.txt` — jangan pernah ikut ter-upload dari repo (sudah di-gitignore), dan jangan sampai tertimpa/terhapus saat deploy ulang — kalau `jwt-secret.txt` berubah, semua sesi login yang aktif akan otomatis logout.

### 8. Asset yang perlu ikut ter-upload

`public/assets/panorama/` (~13MB) dan `public/ml-model/` (~9MB) — keduanya file statis, tidak butuh Node untuk melayani, tapi harus ada di `public/` supaya tur 360° dan prediksi ML jalan.

Detail persis (nama menu, cara set port) bisa berbeda tergantung tampilan panel Rumahweb saat ini — cek dokumentasi/support Rumahweb untuk langkah "Setup Node.js App" terbaru kalau ada yang tidak cocok.
