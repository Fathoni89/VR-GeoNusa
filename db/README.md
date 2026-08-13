# Database — VR-GeoNusa

Skema di `schema.sql` (SQLite, 6 tabel: `users`, `sessions`, `objects`, `predictions`,
`interactions`, `quiz_results`) — dipakai untuk mencatat sesi eksplorasi siswa, hasil
prediksi ML, interaksi gaze, dan hasil kuis.

Belum diwiring ke `server.js`. Saat siap:

```bash
npm install better-sqlite3
```

lalu inisialisasi `data/geonusa.db` dari `schema.sql` sekali di awal `server.js`
(pola sama seperti auto-generate `config/admin.json` yang sudah ada).

Kolom `geometry_label` di tabel `objects` merujuk ke `class_id` pada
[`data/geometry-labels.json`](../data/geometry-labels.json), dan `question_id`
di `quiz_results` merujuk ke `id` pada [`data/quiz.json`](../data/quiz.json).
