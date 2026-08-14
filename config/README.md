# Config Directory

File `admin.json` berisi kredensial admin (username, hashed password, salt, secret).

**PENTING:** File ini ada di `.gitignore` dan TIDAK di-commit ke GitHub.
File akan digenerate otomatis saat pertama kali menjalankan `npm start`.

Bootstrap database MySQL menggunakan username `admin` dan password dari
`BOOTSTRAP_ADMIN_PASSWORD`. Nilai password tidak disimpan di direktori ini dan
wajib diganti via Admin Panel → Pengaturan → Ganti Password.
