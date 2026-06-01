// VR-GeoNusa — Express Backend Server
// Menjalankan frontend statis + REST API untuk admin panel

const express  = require('express');
const cors     = require('cors');
const fs       = require('fs');
const path     = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR   = path.join(__dirname, 'data');
const PUBLIC_DIR = path.join(__dirname, 'public');

app.use(cors());
app.use(express.json());

// ── Serve static frontend files ──────────────────────
app.use(express.static(PUBLIC_DIR));
// Backward compat: lama /admin → /admin/index.html sudah otomatis
// Aset statis lama (assets/, api/) tetap bisa diakses
app.use('/assets', express.static(path.join(__dirname, 'assets')));
app.use('/api/ml-placeholder.json', (req, res) => {
  res.sendFile(path.join(__dirname, 'api', 'ml-placeholder.json'));
});

// ── Helper: baca/tulis JSON ──────────────────────────
function readScene(sceneId) {
  const file = path.join(DATA_DIR, `${sceneId}.json`);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeScene(sceneId, data) {
  const file = path.join(DATA_DIR, `${sceneId}.json`);
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

// ── REST API: Scenes ─────────────────────────────────

// GET /api/scenes — daftar semua scene
app.get('/api/scenes', (req, res) => {
  const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json'));
  const scenes = files.map(f => {
    const data = readScene(path.basename(f, '.json'));
    return {
      scene_id:  data.scene_id,
      name:      data.name,
      location:  data.location,
      era:       data.era,
      obj_count: data.objects?.length || 0,
    };
  });
  res.json({ success: true, data: scenes });
});

// GET /api/scenes/:id — data scene lengkap
app.get('/api/scenes/:id', (req, res) => {
  const data = readScene(req.params.id);
  if (!data) return res.status(404).json({ success: false, message: 'Scene tidak ditemukan' });
  res.json({ success: true, data });
});

// PUT /api/scenes/:id — update metadata scene (name, colors, dll)
app.put('/api/scenes/:id', (req, res) => {
  const data = readScene(req.params.id);
  if (!data) return res.status(404).json({ success: false, message: 'Scene tidak ditemukan' });
  const allowed = ['name','location','era','sky_color','ground_color','cursor_color','label_color'];
  allowed.forEach(k => { if (req.body[k] !== undefined) data[k] = req.body[k]; });
  writeScene(req.params.id, data);
  res.json({ success: true, data });
});

// ── REST API: Objects ────────────────────────────────

// GET /api/scenes/:id/objects — semua objek
app.get('/api/scenes/:id/objects', (req, res) => {
  const data = readScene(req.params.id);
  if (!data) return res.status(404).json({ success: false, message: 'Scene tidak ditemukan' });
  res.json({ success: true, data: data.objects });
});

// POST /api/scenes/:id/objects — tambah objek baru
app.post('/api/scenes/:id/objects', (req, res) => {
  const data = readScene(req.params.id);
  if (!data) return res.status(404).json({ success: false, message: 'Scene tidak ditemukan' });
  const obj = req.body;
  if (!obj.id) return res.status(400).json({ success: false, message: 'Field "id" wajib diisi' });
  if (data.objects.find(o => o.id === obj.id))
    return res.status(409).json({ success: false, message: `ID "${obj.id}" sudah ada` });
  data.objects.push(obj);
  writeScene(req.params.id, data);
  res.status(201).json({ success: true, data: obj });
});

// PUT /api/scenes/:id/objects/:objId — update objek
app.put('/api/scenes/:id/objects/:objId', (req, res) => {
  const data = readScene(req.params.id);
  if (!data) return res.status(404).json({ success: false, message: 'Scene tidak ditemukan' });
  const idx = data.objects.findIndex(o => o.id === req.params.objId);
  if (idx < 0) return res.status(404).json({ success: false, message: 'Objek tidak ditemukan' });
  data.objects[idx] = { ...data.objects[idx], ...req.body, id: req.params.objId };
  writeScene(req.params.id, data);
  res.json({ success: true, data: data.objects[idx] });
});

// DELETE /api/scenes/:id/objects/:objId — hapus objek
app.delete('/api/scenes/:id/objects/:objId', (req, res) => {
  const data = readScene(req.params.id);
  if (!data) return res.status(404).json({ success: false, message: 'Scene tidak ditemukan' });
  const before = data.objects.length;
  data.objects = data.objects.filter(o => o.id !== req.params.objId);
  if (data.objects.length === before)
    return res.status(404).json({ success: false, message: 'Objek tidak ditemukan' });
  writeScene(req.params.id, data);
  res.json({ success: true, message: `Objek "${req.params.objId}" berhasil dihapus` });
});

// PATCH /api/scenes/:id/objects/reorder — ubah urutan
app.patch('/api/scenes/:id/objects/reorder', (req, res) => {
  const data = readScene(req.params.id);
  if (!data) return res.status(404).json({ success: false, message: 'Scene tidak ditemukan' });
  const { order } = req.body; // array of ids
  if (!Array.isArray(order)) return res.status(400).json({ success: false, message: 'Kirim array "order"' });
  data.objects.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  writeScene(req.params.id, data);
  res.json({ success: true, data: data.objects });
});

// ── Health check ─────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'VR-GeoNusa server running',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    scenes: fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json')).map(f => f.replace('.json', '')),
  });
});

// ── Fallback: semua route unknown → index.html ────────
app.get('*', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

// ── Start ─────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🏛️  VR-GeoNusa Server`);
  console.log(`   Portal   → http://localhost:${PORT}`);
  console.log(`   Admin    → http://localhost:${PORT}/admin`);
  console.log(`   API      → http://localhost:${PORT}/api/scenes`);
  console.log(`   VR Scene → http://localhost:${PORT}/vr/borobudur.html\n`);
});
