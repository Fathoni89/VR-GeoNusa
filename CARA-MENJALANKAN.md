# Cara Menjalankan VR-GeoNusa di Lokal

## Prasyarat

Pastikan **Node.js** sudah terinstal. Cek dengan membuka Terminal dan ketik:

```
node --version
```

Jika muncul angka versi (misal `v20.x.x`), berarti sudah siap. Jika belum, unduh di https://nodejs.org.

---

## Langkah-Langkah

### 1. Buka Terminal

Di Mac: tekan **Cmd + Spasi**, ketik `Terminal`, lalu tekan Enter.

### 2. Masuk ke Folder Project

```bash
cd ~/VR-GeoNusa
```

### 3. Jalankan Server

```bash
node server.js
```

Jika berhasil, akan muncul pesan seperti ini:

```
🏛️  VR-GeoNusa Server v1.1
   Portal   → http://localhost:4000
   Admin    → http://localhost:4000/admin
   API      → http://localhost:4000/api/scenes
```

### 4. Buka di Browser

| Halaman       | Alamat                          |
|---------------|---------------------------------|
| Portal Utama  | http://localhost:4000           |
| Admin Panel   | http://localhost:4000/admin     |

**Login admin:** username `admin`, password `geonusa2026`

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

---

## Deploy ke Rumahweb Medium (Hosting Produksi)

Backend project ini (Express + SQLite — login admin, CRUD scene, log sesi siswa, kuis, laporan guru) butuh Node.js yang **jalan terus**, bukan cuma file statis. Paket **Rumahweb Unlimited S tidak mendukung ini** — hanya paket **Medium ke atas** yang menyediakan akses SSH + Node.js. Langkah umum setelah akun Medium aktif:

### 1. Upload kode ke server

Lewat SSH (`git clone` repo ini) atau upload manual via File Manager/FTP. **Yang tidak perlu ikut diupload:** `MLTraining/venv/` dan `node_modules/` (besar, dan dibuat ulang di server), juga `Dataset/geometry_wbn/train|val|test/` (dataset training mentah, bukan bagian aplikasi yang jalan).

### 2. Install dependency di server

```bash
cd vr-geonusa
npm install --omit=dev
```

### 3. Jalankan sebagai proses yang tidak mati

Server biasa (`node server.js`) akan mati begitu koneksi SSH ditutup. Pakai **PM2** supaya tetap jalan di background dan otomatis restart kalau server reboot:

```bash
npm install -g pm2
pm2 start server.js --name vr-geonusa
pm2 save
pm2 startup   # ikuti instruksi yang muncul, sekali saja
```

### 4. Sesuaikan port

Rumahweb biasanya menetapkan port tertentu untuk aplikasi Node (lihat panel "Setup Node.js App" di cPanel Rumahweb). `server.js` sudah membaca `process.env.PORT`, jadi tinggal set env var itu sesuai yang diberikan panel — tidak perlu ubah kode.

### 5. Data yang harus tetap ada di server (jangan ikut dihapus saat update kode)

- `data/geonusa.db` — database sesi siswa/kuis. **Backup berkala**, dan jangan pernah timpa dengan file kosong saat deploy ulang.
- `config/admin.json` — kredensial admin (dibuat otomatis saat pertama kali `server.js` jalan kalau belum ada).

### 6. Asset yang perlu ikut ter-upload

`public/assets/panorama/` (~13MB) dan `public/ml-model/` (~9MB) — keduanya file statis, tidak butuh Node untuk melayani, tapi harus ada di `public/` supaya tur 360° dan prediksi ML jalan.

Detail persis (nama menu, cara set port) bisa berbeda tergantung tampilan panel Rumahweb saat ini — cek dokumentasi/support Rumahweb untuk langkah "Setup Node.js App" terbaru kalau ada yang tidak cocok.
