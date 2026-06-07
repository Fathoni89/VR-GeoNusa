// VR-GeoNusa — Express Backend Server
// Menjalankan frontend statis + REST API + Auth untuk admin panel

const express  = require('express');
const cors     = require('cors');
const crypto   = require('crypto');
const fs       = require('fs');
const path     = require('path');

const app  = express();
const PORT = process.env.PORT || 4000;

// ── Auto-generate config/admin.json jika belum ada ──
const configFile = path.join(__dirname, 'config', 'admin.json');
if (!fs.existsSync(configFile)) {
  fs.mkdirSync(path.join(__dirname, 'config'), { recursive: true });
  const salt   = crypto.randomBytes(16).toString('hex');
  const secret = crypto.randomBytes(32).toString('hex');
  const hash   = crypto.createHmac('sha256', salt).update('geonusa2026').digest('hex');
  fs.writeFileSync(configFile, JSON.stringify({ username:'admin', password_hash:hash, salt, secret }, null, 2));
  console.log('⚙️  Config admin dibuat otomatis. Default: admin / geonusa2026');
}
const DATA_DIR   = path.join(__dirname, 'data');
const PUBLIC_DIR = path.join(__dirname, 'public');
const VR_DIR     = path.join(PUBLIC_DIR, 'vr');
const CONFIG_DIR = path.join(__dirname, 'config');

app.use(cors());
app.use(express.json());

// ── Auth helpers ─────────────────────────────────────
function loadAuthConfig() {
  const file = path.join(CONFIG_DIR, 'admin.json');
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function hashPassword(password, salt) {
  return crypto.createHmac('sha256', salt).update(password).digest('hex');
}

function generateToken(username) {
  const cfg = loadAuthConfig();
  const payload = Buffer.from(JSON.stringify({ username, ts: Date.now() })).toString('base64');
  const sig = crypto.createHmac('sha256', cfg.secret).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

function verifyToken(token) {
  try {
    const cfg = loadAuthConfig();
    const [payload, sig] = token.split('.');
    const expected = crypto.createHmac('sha256', cfg.secret).update(payload).digest('hex');
    if (sig !== expected) return null;
    const data = JSON.parse(Buffer.from(payload, 'base64').toString());
    // Token valid 24 jam
    if (Date.now() - data.ts > 86400000) return null;
    return data;
  } catch { return null; }
}

// ── Auth middleware (lindungi endpoint write) ─────────
function requireAuth(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token || !verifyToken(token)) {
    return res.status(401).json({ success: false, message: 'Unauthorized — login terlebih dahulu' });
  }
  next();
}

// ── Route eksplisit halaman ───────────────────────────
app.get('/',             (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'index.html')));
app.get('/admin',        (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'admin', 'index.html')));
app.get('/admin/login',  (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'admin', 'index.html')));

// ── Static files ──────────────────────────────────────
app.use(express.static(PUBLIC_DIR, { index: false }));
app.use('/assets', express.static(path.join(__dirname, 'assets')));
app.use('/data',   express.static(DATA_DIR));
app.get('/api/ml-placeholder.json', (req, res) =>
  res.sendFile(path.join(__dirname, 'api', 'ml-placeholder.json'))
);

// ── Helper JSON ───────────────────────────────────────
function readScene(sceneId) {
  const file = path.join(DATA_DIR, `${sceneId}.json`);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
function writeScene(sceneId, data) {
  const json = JSON.stringify(data, null, 2);
  // Tulis ke data/ (sumber backend)
  fs.writeFileSync(path.join(DATA_DIR, `${sceneId}.json`), json, 'utf8');
  // Sinkron ke public/data/ agar GitHub Pages selalu up-to-date
  const pubDataDir = path.join(PUBLIC_DIR, 'data');
  if (!fs.existsSync(pubDataDir)) fs.mkdirSync(pubDataDir, { recursive: true });
  fs.writeFileSync(path.join(pubDataDir, `${sceneId}.json`), json, 'utf8');
}

// ── VR HTML template generator ────────────────────────
function generateVrPage(scene) {
  const cursorColor = scene.cursor_color || '#00e5ff';
  const labelColor  = scene.label_color  || '#00e5ff';
  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="#0F172A">
  <title>VR-GeoNusa — ${scene.name}</title>
  <script src="https://aframe.io/releases/1.5.0/aframe.min.js"></script>
  <script src="https://cdn.jsdelivr.net/gh/c-frame/aframe-extras@7.2.0/dist/aframe-extras.min.js"></script>
  <link rel="stylesheet" href="../css/ui.css">
</head>
<body>
<div id="loading-bar"></div>
<div id="splash">
  <div class="logo-wrap">
    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="32" cy="32" r="30" stroke="#818CF8" stroke-width="1.5" opacity="0.4"/>
      <polygon points="32,8 52,44 12,44" stroke="#38BDF8" stroke-width="1.8" fill="rgba(56,189,248,0.08)"/>
      <rect x="22" y="44" width="20" height="8" rx="2" stroke="#A78BFA" stroke-width="1.5" fill="rgba(167,139,250,0.08)"/>
    </svg>
  </div>
  <h1>VR-GeoNusa</h1>
  <p class="tagline">${scene.name} — ${scene.location}</p>
  <div class="scene-list">
    <div class="scene-card" onclick="window.location.href='../vr/borobudur.html'">
      <div class="sc-name">Candi Borobudur</div><div class="sc-loc">Magelang, Jawa Tengah</div>
    </div>
    <div class="scene-card active">
      <div class="sc-name">${scene.name}</div><div class="sc-loc">${scene.location}</div>
    </div>
  </div>
  <button onclick="startApp()">Masuk Eksplorasi</button>
  <div class="meta">Prototype Tahun 1 — Hibah Fundamental BIMA 2026<br>
  Arahkan kursor ke objek bercahaya → tahan 1.5 detik → info geometri muncul</div>
</div>
<div id="hud" style="display:none">
  <div id="hud-scene">
    <div class="hud-label">VR-GeoNusa</div>
    <div class="hud-name" id="hud-name">${scene.name}</div>
    <div class="hud-loc" id="hud-loc">${scene.location}</div>
  </div>
</div>
<div id="controls-hint">WASD bergerak &nbsp;·&nbsp; Mouse lihat &nbsp;·&nbsp; Tahan kursor ke objek untuk identifikasi</div>
<div id="info-overlay">
  <button class="close" onclick="hideInfo()" aria-label="Tutup">×</button>
  <div class="panel-label">Geometri Teridentifikasi</div>
  <div class="geo-name" id="info-geo-name">—</div>
  <div class="geo-sub" id="info-geo-sub">—</div>
  <div class="element-tag" id="info-element"></div>
  <div class="conf-row">
    <span class="conf-title">Confidence ML</span>
    <span class="conf-text" id="info-conf-text">0%</span>
  </div>
  <div class="conf-bar"><div class="conf-fill" id="info-conf-bar" style="width:0%"></div></div>
  <div class="props">
    <div><div class="prop-val" id="info-sisi">0</div><div class="prop-label">Sisi</div></div>
    <div><div class="prop-val" id="info-rusuk">0</div><div class="prop-label">Rusuk</div></div>
    <div><div class="prop-val" id="info-titik">0</div><div class="prop-label">Titik Sudut</div></div>
  </div>
  <div class="formula-block">
    <div class="formula"><b>V =</b> <span id="info-volume">—</span></div>
    <div class="formula"><b>L =</b> <span id="info-luas">—</span></div>
  </div>
  <div class="context">
    <div class="ctx-label">Konteks Budaya</div>
    <div id="info-context">—</div>
  </div>
</div>
<button id="scene-btn" onclick="window.location.href='/'">← Portal</button>
<a-scene id="vrscene"
  vr-mode-ui="enabled: true"
  renderer="colorManagement:true; sortObjects:true; physicallyCorrectLights:true"
  loading-screen="enabled:false"
  style="display:none">
  <a-assets timeout="10000"></a-assets>
  <a-sky color="${scene.sky_color || '#1a2744'}"></a-sky>
  <a-entity light="type:ambient; color:#8899aa; intensity:0.45"></a-entity>
  <a-entity light="type:directional; color:#ffeedd; intensity:0.85" position="2 4 2"></a-entity>
  <a-plane position="0 0 0" rotation="-90 0 0" width="80" height="80" color="${scene.ground_color || '#2d4a2a'}" roughness="1" data-ground></a-plane>
  <a-entity id="scene-label-wrap" position="0 5 -8">
    <a-text id="scene-label-main" value="${scene.name.toUpperCase()}" align="center" color="${labelColor}" width="10" opacity="0.55"></a-text>
    <a-text id="scene-label-sub"  value="${scene.era}" align="center" color="#ffffff" width="6" position="0 -0.45 0" opacity="0.25"></a-text>
  </a-entity>
  <a-text value="Arahkan kursor ke objek berwarna · tahan 1.5 detik · identifikasi geometri"
    align="center" color="#ffffff" width="7" opacity="0.2"
    position="0 0.05 -2" rotation="-90 0 0"></a-text>
  <a-entity id="rig" movement-controls="speed:0.15" position="0 0 2">
    <a-entity camera look-controls="pointerLockEnabled:false" position="0 1.6 0">
      <a-cursor fuse="true" fuse-timeout="1500" color="${cursorColor}" opacity="0.8"
        raycaster="objects:.wbn-object; far:25"
        animation__fusing="property:scale; from:1 1 1; to:0.5 0.5 0.5; dur:1500; startEvents:fusing"
        animation__defuse="property:scale; to:1 1 1; dur:200; startEvents:mouseleave">
      </a-cursor>
    </a-entity>
  </a-entity>
</a-scene>
<script src="../js/scene-loader.js"></script>
<script src="../js/app.js"></script>
<script>
currentScene = '${scene.scene_id}';
document.addEventListener('DOMContentLoaded', () => {
  const vrscene = document.getElementById('vrscene');
  if (vrscene.hasLoaded) { loadObjects(); }
  else { vrscene.addEventListener('loaded', loadObjects); }
});
async function loadObjects() {
  // Coba API backend dulu, fallback ke JSON statis (GitHub Pages)
  const urls = ['/api/scenes/${scene.scene_id}', '../data/${scene.scene_id}.json'];
  for (const url of urls) {
    try {
      const res  = await fetch(url);
      const json = await res.json();
      const objects = json.data?.objects ?? json.objects ?? [];
      objects.forEach(obj => {
        const el = buildAFrameEntity(obj);
        document.getElementById('vrscene').appendChild(el);
      });
      initInteractions();
      return;
    } catch(_) {}
  }
  initInteractions(); // tetap init meski gagal load
}
</script>
</body>
</html>`;
}

// ══════════════════════════════════════════════════════
// REST API — AUTH
// ══════════════════════════════════════════════════════

// POST /api/auth/login
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password)
    return res.status(400).json({ success: false, message: 'Username dan password wajib diisi' });
  const cfg = loadAuthConfig();
  if (username !== cfg.username)
    return res.status(401).json({ success: false, message: 'Username atau password salah' });
  const hash = hashPassword(password, cfg.salt);
  if (hash !== cfg.password_hash)
    return res.status(401).json({ success: false, message: 'Username atau password salah' });
  const token = generateToken(username);
  res.json({ success: true, token, username });
});

// GET /api/auth/verify
app.get('/api/auth/verify', (req, res) => {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  const data = token ? verifyToken(token) : null;
  if (!data) return res.status(401).json({ success: false, message: 'Token tidak valid atau expired' });
  res.json({ success: true, username: data.username });
});

// POST /api/auth/change-password
app.post('/api/auth/change-password', requireAuth, (req, res) => {
  const { old_password, new_password } = req.body || {};
  if (!old_password || !new_password)
    return res.status(400).json({ success: false, message: 'old_password dan new_password wajib' });
  if (new_password.length < 6)
    return res.status(400).json({ success: false, message: 'Password minimal 6 karakter' });
  const cfg = loadAuthConfig();
  const oldHash = hashPassword(old_password, cfg.salt);
  if (oldHash !== cfg.password_hash)
    return res.status(401).json({ success: false, message: 'Password lama salah' });
  const newSalt = crypto.randomBytes(16).toString('hex');
  const newHash = hashPassword(new_password, newSalt);
  cfg.salt = newSalt;
  cfg.password_hash = newHash;
  fs.writeFileSync(path.join(CONFIG_DIR, 'admin.json'), JSON.stringify(cfg, null, 2));
  res.json({ success: true, message: 'Password berhasil diubah' });
});

// ══════════════════════════════════════════════════════
// REST API — SCENES (CRUD)
// ══════════════════════════════════════════════════════

// GET /api/scenes
app.get('/api/scenes', (req, res) => {
  const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json'));
  const scenes = files.map(f => {
    const data = readScene(path.basename(f, '.json'));
    return { scene_id: data.scene_id, name: data.name, location: data.location, era: data.era, obj_count: data.objects?.length || 0 };
  });
  res.json({ success: true, data: scenes });
});

// GET /api/scenes/:id
app.get('/api/scenes/:id', (req, res) => {
  const data = readScene(req.params.id);
  if (!data) return res.status(404).json({ success: false, message: 'Scene tidak ditemukan' });
  res.json({ success: true, data });
});

// POST /api/scenes — buat scene baru (auth required)
app.post('/api/scenes', requireAuth, (req, res) => {
  const { scene_id, name, location, era, sky_color, ground_color, cursor_color, label_color } = req.body;
  if (!scene_id || !name)
    return res.status(400).json({ success: false, message: 'scene_id dan name wajib diisi' });
  const id = scene_id.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  if (readScene(id))
    return res.status(409).json({ success: false, message: `Scene "${id}" sudah ada` });
  const newScene = {
    scene_id: id, name, location: location || '', era: era || '',
    sky_color: sky_color || '#1a2744', ground_color: ground_color || '#2d4a2a',
    cursor_color: cursor_color || '#00e5ff', label_color: label_color || '#00e5ff',
    objects: [],
  };
  writeScene(id, newScene);
  // Generate VR HTML page
  const vrPage = generateVrPage(newScene);
  fs.writeFileSync(path.join(VR_DIR, `${id}.html`), vrPage, 'utf8');
  res.status(201).json({ success: true, data: newScene, vr_url: `/vr/${id}.html` });
});

// PUT /api/scenes/:id — update metadata (auth required)
app.put('/api/scenes/:id', requireAuth, (req, res) => {
  const data = readScene(req.params.id);
  if (!data) return res.status(404).json({ success: false, message: 'Scene tidak ditemukan' });
  const allowed = ['name','location','era','sky_color','ground_color','cursor_color','label_color'];
  allowed.forEach(k => { if (req.body[k] !== undefined) data[k] = req.body[k]; });
  writeScene(req.params.id, data);
  // Regenerate VR page
  fs.writeFileSync(path.join(VR_DIR, `${req.params.id}.html`), generateVrPage(data), 'utf8');
  res.json({ success: true, data });
});

// DELETE /api/scenes/:id — hapus scene (auth required)
app.delete('/api/scenes/:id', requireAuth, (req, res) => {
  const id = req.params.id;
  if (['borobudur','prambanan'].includes(id))
    return res.status(403).json({ success: false, message: 'Scene default tidak bisa dihapus' });
  const file = path.join(DATA_DIR, `${id}.json`);
  if (!fs.existsSync(file)) return res.status(404).json({ success: false, message: 'Scene tidak ditemukan' });
  fs.unlinkSync(file);
  const vrFile = path.join(VR_DIR, `${id}.html`);
  if (fs.existsSync(vrFile)) fs.unlinkSync(vrFile);
  res.json({ success: true, message: `Scene "${id}" berhasil dihapus` });
});

// ══════════════════════════════════════════════════════
// REST API — OBJECTS (auth required untuk write)
// ══════════════════════════════════════════════════════

app.get('/api/scenes/:id/objects', (req, res) => {
  const data = readScene(req.params.id);
  if (!data) return res.status(404).json({ success: false, message: 'Scene tidak ditemukan' });
  res.json({ success: true, data: data.objects });
});

app.post('/api/scenes/:id/objects', requireAuth, (req, res) => {
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

app.put('/api/scenes/:id/objects/:objId', requireAuth, (req, res) => {
  const data = readScene(req.params.id);
  if (!data) return res.status(404).json({ success: false, message: 'Scene tidak ditemukan' });
  const idx = data.objects.findIndex(o => o.id === req.params.objId);
  if (idx < 0) return res.status(404).json({ success: false, message: 'Objek tidak ditemukan' });
  data.objects[idx] = { ...data.objects[idx], ...req.body, id: req.params.objId };
  writeScene(req.params.id, data);
  res.json({ success: true, data: data.objects[idx] });
});

app.delete('/api/scenes/:id/objects/:objId', requireAuth, (req, res) => {
  const data = readScene(req.params.id);
  if (!data) return res.status(404).json({ success: false, message: 'Scene tidak ditemukan' });
  const before = data.objects.length;
  data.objects = data.objects.filter(o => o.id !== req.params.objId);
  if (data.objects.length === before)
    return res.status(404).json({ success: false, message: 'Objek tidak ditemukan' });
  writeScene(req.params.id, data);
  res.json({ success: true, message: `Objek "${req.params.objId}" berhasil dihapus` });
});

// ── Health check ─────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'VR-GeoNusa server running', version: '1.1.0',
    timestamp: new Date().toISOString(),
    scenes: fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json')).map(f => f.replace('.json','')),
  });
});

// ── Fallback ─────────────────────────────────────────
app.get('*', (req, res) => {
  const filePath = path.join(PUBLIC_DIR, req.path);
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) return res.sendFile(filePath);
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

// ── Start ─────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🏛️  VR-GeoNusa Server v1.1`);
  console.log(`   Portal   → http://localhost:${PORT}`);
  console.log(`   Admin    → http://localhost:${PORT}/admin`);
  console.log(`   API      → http://localhost:${PORT}/api/scenes`);
  console.log(`\n   Default login: admin / geonusa2026\n`);
});
