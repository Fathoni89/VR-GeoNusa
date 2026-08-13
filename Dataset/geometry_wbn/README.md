# Dataset — Geometri WBN (Warisan Budaya Nusantara)

Dataset citra untuk training model klasifikasi geometri (`MLTraining/`), dikonversi
ke TensorFlow.js dan dimuat oleh `ml-model/` di frontend.

6 kelas, sesuai `class_id` pada [`data/geometry-labels.json`](../../data/geometry-labels.json):

| class_id | Label | Sumber elemen di scene Borobudur |
|---|---|---|
| `limas-segiempat` | Limas Segiempat | Dasar candi (`obj-dasar`) |
| `balok` | Balok | Teras Rupadhatu (`obj-teras1`) |
| `setengah-bola` | Setengah Bola | Stupa utama (`obj-stupa`) |
| `tabung` | Tabung | Stupa berlubang, pilar gapura |
| `prisma-segitiga` | Prisma Segitiga | Tangga masuk (`obj-tangga`) |
| `kerucut` | Kerucut | Ornamen puncak gapura (`obj-kerucut`) |

## Target

- Minimal 30, idealnya 50 gambar per kelas (lihat `target_images_per_class` di
  `geometry-labels.json`).
- Split 70/20/10 ke `train/`, `val/`, `test/` (folder sudah dibuat).

## Cara mengisi

1. Render/screenshot `borobudur.glb` dari berbagai sudut, jarak, dan pencahayaan
   untuk tiap elemen di atas.
2. Crop manual bagian yang relevan (stupa, tangga, pilar, teras, dst).
3. Augmentasi ringan (rotasi, brightness, zoom) kalau jumlah gambar asli sedikit.
4. Taruh file ke `train/<class_id>/`, `val/<class_id>/`, `test/<class_id>/`.

Folder ini sudah di-gitignore (`.gitignore` → `/Dataset/geometry_wbn/{train,val,test}/`)
karena isinya gambar mentah yang besar — jangan commit dataset ke Git.
