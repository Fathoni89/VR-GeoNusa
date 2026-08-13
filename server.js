// VR-GeoNusa — Express Backend Server
// Menjalankan frontend statis + REST API + Auth (multi-sekolah) + MySQL

require('dotenv').config();

const express      = require('express');
const cors         = require('cors');
const crypto       = require('crypto');
const fs           = require('fs');
const path         = require('path');
const mysql        = require('mysql2/promise');
const bcrypt       = require('bcryptjs');
const jwt          = require('jsonwebtoken');
const rateLimit    = require('express-rate-limit');
const mlPredict     = require('./ml/predict');
const TEAM_FILE    = path.join(__dirname, 'data', 'team.json');

const app  = express();
const PORT = process.env.PORT || 4000;

// Satu request yang error (mis. query DB gagal) sebelumnya bisa menjatuhkan
// SELURUH server — fatal untuk pilot dengan banyak peserta bersamaan, karena
// satu siswa bermasalah akan memutus sesi semua siswa lain. Log saja, jangan
// exit proses.
process.on('unhandledRejection', (err) => {
  console.error('⚠️  Unhandled promise rejection (server tetap jalan):', err);
});
process.on('uncaughtException', (err) => {
  console.error('⚠️  Uncaught exception (server tetap jalan):', err);
});

const DATA_DIR    = path.join(__dirname, 'data');
const PUBLIC_DIR  = path.join(__dirname, 'public');
const VR_DIR      = path.join(PUBLIC_DIR, 'vr');
const CONFIG_DIR  = path.join(__dirname, 'config');
const DATASET_DIR = path.join(__dirname, 'Dataset', 'geometry_wbn');

// ── JWT secret — auto-generate & persist lokal jika belum ada (kredensial
// database TETAP harus diisi manual lewat .env, ini cuma untuk menandatangani
// token, bukan rahasia yang perlu dibagi antar admin) ──
const secretFile = path.join(CONFIG_DIR, 'jwt-secret.txt');
if (!fs.existsSync(secretFile)) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(secretFile, crypto.randomBytes(32).toString('hex'));
}
const JWT_SECRET = fs.readFileSync(secretFile, 'utf8').trim();

// ── Database (MySQL/MariaDB) ──────────────────────────
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  multipleStatements: true, // hanya dipakai sekali saat inisialisasi skema
});

// `CREATE TABLE IF NOT EXISTS` tidak menambah kolom baru ke tabel yang sudah
// ada dari deploy sebelumnya (mis. `sessions` sudah ada sebelum kolom
// student_id/class_id ditambahkan ke schema.mysql.sql) — jadi kolom baru
// perlu ditambah manual lewat migrasi kecil ini, dicek dulu supaya aman
// dijalankan berkali-kali (idempotent) di semua versi MySQL/MariaDB.
async function ensureColumn(table, column, definition) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [process.env.DB_NAME, table, column]
  );
  if (rows[0].cnt === 0) {
    await pool.query(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
    console.log(`⚙️  Migrasi: kolom "${column}" ditambahkan ke tabel "${table}"`);
  }
}

// Sama seperti ensureColumn — ALTER TABLE ... MODIFY COLUMN untuk menambah
// nilai ENUM baru ('school_admin') ke deploy lama yang masih pakai ENUM lama.
async function ensureAccountsRoleEnum() {
  const [[row]] = await pool.query(
    `SELECT COLUMN_TYPE AS type FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'accounts' AND COLUMN_NAME = 'role'`,
    [process.env.DB_NAME]
  );
  if (row && !row.type.includes('school_admin')) {
    await pool.query(`ALTER TABLE accounts MODIFY COLUMN role ENUM('super_admin','school_admin','teacher') NOT NULL DEFAULT 'teacher'`);
    console.log('⚙️  Migrasi: role "school_admin" ditambahkan ke enum accounts.role');
  }
}

async function initDb() {
  const schema = fs.readFileSync(path.join(__dirname, 'db', 'schema.mysql.sql'), 'utf8');
  await pool.query(schema);

  await ensureColumn('sessions', 'student_id', 'student_id INT NULL REFERENCES students(id)');
  await ensureColumn('sessions', 'class_id', 'class_id INT NULL REFERENCES classes(id)');
  await ensureAccountsRoleEnum();

  // Bootstrap: kalau belum ada akun sama sekali, buat super_admin default
  // (kredensial sama seperti config/admin.json lama supaya tim yang sudah
  // tahu passwordnya tidak perlu reset — hanya dicatat di console, TIDAK
  // ditampilkan di layar login).
  const [[{ cnt }]] = await pool.query('SELECT COUNT(*) AS cnt FROM accounts');
  if (cnt === 0) {
    const hash = await bcrypt.hash('geonusa2026', 10);
    await pool.query(
      'INSERT INTO accounts (username, password_hash, role, school_id) VALUES (?, ?, ?, NULL)',
      ['admin', hash, 'super_admin']
    );
    console.log('⚙️  Akun super_admin default dibuat. Login: admin / geonusa2026 (ganti setelah login pertama)');
  }
}

async function upsertObject({ object_code, object_name, geometry_label }) {
  if (!object_code) return null;
  await pool.query(
    `INSERT INTO objects (object_code, object_name, geometry_label) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE object_name = VALUES(object_name), geometry_label = VALUES(geometry_label)`,
    [object_code, object_name || object_code, geometry_label || null]
  );
  const [[row]] = await pool.query('SELECT id FROM objects WHERE object_code = ?', [object_code]);
  return row.id;
}

app.use(cors());
app.use(express.json());

// ── Auth helpers ─────────────────────────────────────
function generateToken(account) {
  return jwt.sign(
    { account_id: account.id, username: account.username, role: account.role, school_id: account.school_id },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
}

function verifyToken(token) {
  try { return jwt.verify(token, JWT_SECRET); }
  catch { return null; }
}

// ── Auth middleware (lindungi endpoint write) ─────────
function requireAuth(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  const account = token ? verifyToken(token) : null;
  if (!account) {
    return res.status(401).json({ success: false, message: 'Unauthorized — login terlebih dahulu' });
  }
  req.account = account;
  next();
}

function requireRole(role) {
  return (req, res, next) => {
    if (req.account.role !== role) {
      return res.status(403).json({ success: false, message: 'Tidak punya akses untuk aksi ini' });
    }
    next();
  };
}

// Untuk endpoint yang boleh diakses lebih dari satu role staf, mis.
// super_admin (semua sekolah) DAN school_admin (sekolahnya sendiri).
function requireAnyRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.account.role)) {
      return res.status(403).json({ success: false, message: 'Tidak punya akses untuk aksi ini' });
    }
    next();
  };
}

// Guru hanya boleh melihat sekolahnya sendiri — school_id dari query/body
// diabaikan untuk role selain super_admin, supaya tidak bisa dipalsukan.
function effectiveSchoolId(req, requestedSchoolId) {
  if (req.account.role === 'super_admin') {
    return requestedSchoolId ? Number(requestedSchoolId) : null; // null = semua sekolah
  }
  return req.account.school_id;
}

// ── Rate limit endpoint publik (tulis data siswa) ─────
const publicWriteLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60, // 60 request/menit per IP — cukup longgar untuk pemakaian normal, menahan banjir
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Terlalu banyak permintaan, coba lagi sebentar.' },
});

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

// ── Pemetaan soal kuis → konsep geometri (untuk rekomendasi dashboard guru) ──
const GEOMETRY_LABELS_ID = {
  'balok': 'Balok', 'kerucut': 'Kerucut', 'limas-segiempat': 'Limas Segiempat',
  'prisma-segitiga': 'Prisma Segitiga', 'setengah-bola': 'Setengah Bola', 'tabung': 'Tabung',
};
let quizConceptMapCache = null;
function questionIdToConcept(questionId) {
  if (!quizConceptMapCache) {
    quizConceptMapCache = {};
    try {
      const quiz = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'quiz.json'), 'utf8'));
      (quiz.questions || []).forEach(q => { quizConceptMapCache[q.id] = q.class_id; });
    } catch { /* quiz.json opsional — rekomendasi konsep cuma dilewati */ }
  }
  return quizConceptMapCache[questionId] || null;
}
function conceptRecommendation(label, accuracyPct, attempts) {
  const name = GEOMETRY_LABELS_ID[label] || label;
  if (attempts < 3) return `Data untuk konsep ${name} masih sedikit (${attempts} percobaan) — belum cukup untuk rekomendasi yang andal.`;
  if (accuracyPct < 60) return `Sebagian besar siswa masih kesulitan dengan konsep ${name} (akurasi ${accuracyPct}%). Guru disarankan memberi contoh konkret tambahan sebelum sesi VR berikutnya.`;
  if (accuracyPct < 85) return `Siswa sudah cukup baik pada konsep ${name} (akurasi ${accuracyPct}%), tapi masih perlu penguatan pada beberapa siswa.`;
  return `Siswa sudah menguasai konsep ${name} dengan baik (akurasi ${accuracyPct}%).`;
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
    <div class="scene-card" onclick="window.location.href='../vr/tour-borobudur.html'">
      <div class="sc-name">Candi Borobudur</div><div class="sc-loc">Magelang, Jawa Tengah</div>
    </div>
    <div class="scene-card active">
      <div class="sc-name">${scene.name}</div><div class="sc-loc">${scene.location}</div>
    </div>
  </div>
  <div class="login-mode-tabs">
    <button type="button" class="mode-tab active" data-mode="guest" onclick="setLoginMode('guest')">Tamu</button>
    <button type="button" class="mode-tab" data-mode="student" onclick="setLoginMode('student')">Login Siswa</button>
  </div>
  <div id="guest-fields">
    <input id="student-name" class="splash-input" type="text" placeholder="Nama kamu (opsional)" maxlength="100">
    <select id="student-school" class="splash-input school-select"><option value="">Pilih sekolah (opsional)</option></select>
  </div>
  <div id="student-login-fields" style="display:none">
    <select id="login-school" class="splash-input school-select"><option value="">Pilih sekolah</option></select>
    <input id="login-student-number" class="splash-input" type="text" placeholder="Nomor Induk">
    <input id="login-student-password" class="splash-input" type="password" placeholder="Password">
    <div id="student-login-error" class="splash-error"></div>
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
  <button id="quiz-trigger-btn" onclick="openQuiz()">📝 Uji Pemahaman</button>
</div>
<div id="quiz-overlay">
  <button class="close" onclick="closeQuiz()" aria-label="Tutup">×</button>
  <div class="panel-label">Uji Pemahaman</div>
  <div id="quiz-question" class="quiz-question">—</div>
  <div id="quiz-options" class="quiz-options"></div>
  <div id="quiz-feedback" class="quiz-feedback"></div>
</div>
<button id="scene-btn" onclick="window.location.href='/'">← Portal</button>
<button id="student-results-toggle" onclick="toggleStudentResults()">📊 Hasil Saya</button>
<div id="student-results-panel"></div>
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
currentScene = ${JSON.stringify(scene.scene_id)};
// Scene buatan admin tidak ada di SCENES statis bawaan app.js (cuma
// berisi 'prambanan') — daftarkan di sini supaya loadScene() di app.js
// tidak diam-diam berhenti dan gagal menampilkan scene-nya.
SCENES[currentScene] = {
  name: ${JSON.stringify(scene.name)},
  location: ${JSON.stringify(scene.location || '')},
  era: ${JSON.stringify(scene.era || '')},
};
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
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password)
    return res.status(400).json({ success: false, message: 'Username dan password wajib diisi' });

  const [[account]] = await pool.query('SELECT * FROM accounts WHERE username = ?', [username]);
  if (!account) return res.status(401).json({ success: false, message: 'Username atau password salah' });

  const ok = await bcrypt.compare(password, account.password_hash);
  if (!ok) return res.status(401).json({ success: false, message: 'Username atau password salah' });

  const token = generateToken(account);
  res.json({ success: true, token, username: account.username, role: account.role, school_id: account.school_id });
});

// GET /api/auth/verify
app.get('/api/auth/verify', (req, res) => {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  const data = token ? verifyToken(token) : null;
  if (!data) return res.status(401).json({ success: false, message: 'Token tidak valid atau expired' });
  res.json({ success: true, username: data.username, role: data.role, school_id: data.school_id });
});

// POST /api/auth/change-password
app.post('/api/auth/change-password', requireAuth, async (req, res) => {
  const { old_password, new_password } = req.body || {};
  if (!old_password || !new_password)
    return res.status(400).json({ success: false, message: 'old_password dan new_password wajib' });
  if (new_password.length < 6)
    return res.status(400).json({ success: false, message: 'Password minimal 6 karakter' });

  const [[account]] = await pool.query('SELECT * FROM accounts WHERE id = ?', [req.account.account_id]);
  const ok = await bcrypt.compare(old_password, account.password_hash);
  if (!ok) return res.status(401).json({ success: false, message: 'Password lama salah' });

  const newHash = await bcrypt.hash(new_password, 10);
  await pool.query('UPDATE accounts SET password_hash = ? WHERE id = ?', [newHash, account.id]);
  res.json({ success: true, message: 'Password berhasil diubah' });
});

// ══════════════════════════════════════════════════════
// REST API — SEKOLAH & AKUN GURU (super_admin only kecuali GET publik)
// ══════════════════════════════════════════════════════

// GET /api/schools — publik (dipakai dropdown sekolah di splash screen)
app.get('/api/schools', async (req, res) => {
  const [rows] = await pool.query('SELECT id, name FROM schools ORDER BY name');
  res.json({ success: true, data: rows });
});

// POST /api/schools (super_admin)
app.post('/api/schools', requireAuth, requireRole('super_admin'), async (req, res) => {
  const { name, code } = req.body || {};
  if (!name) return res.status(400).json({ success: false, message: 'name wajib diisi' });
  const [result] = await pool.query('INSERT INTO schools (name, code) VALUES (?, ?)', [name, code || null]);
  res.status(201).json({ success: true, data: { id: result.insertId, name, code } });
});

// DELETE /api/schools/:id (super_admin)
app.delete('/api/schools/:id', requireAuth, requireRole('super_admin'), async (req, res) => {
  await pool.query('DELETE FROM schools WHERE id = ?', [req.params.id]);
  res.json({ success: true, message: 'Sekolah dihapus' });
});

// GET /api/accounts — super_admin: semua akun; school_admin: akun guru di
// sekolahnya sendiri saja (tanpa password_hash)
app.get('/api/accounts', requireAuth, requireAnyRole('super_admin', 'school_admin'), async (req, res) => {
  let sql = `
    SELECT a.id, a.username, a.role, a.school_id, s.name AS school_name, a.created_at
    FROM accounts a LEFT JOIN schools s ON s.id = a.school_id
    WHERE 1=1`;
  const params = [];
  if (req.account.role !== 'super_admin') { sql += ' AND a.school_id = ?'; params.push(req.account.school_id); }
  sql += ' ORDER BY a.created_at DESC';
  const [rows] = await pool.query(sql, params);
  res.json({ success: true, data: rows });
});

// POST /api/accounts — super_admin: bikin akun peran apa saja, sekolah mana
// saja; school_admin: cuma bisa bikin akun guru, otomatis di sekolahnya
// sendiri (school_id dari body diabaikan supaya tidak bisa dipalsukan).
app.post('/api/accounts', requireAuth, requireAnyRole('super_admin', 'school_admin'), async (req, res) => {
  const { username, password, role } = req.body || {};
  let { school_id } = req.body || {};
  if (!username || !password) return res.status(400).json({ success: false, message: 'username dan password wajib diisi' });
  if (password.length < 6) return res.status(400).json({ success: false, message: 'Password minimal 6 karakter' });

  let finalRole;
  if (req.account.role === 'super_admin') {
    finalRole = ['super_admin', 'school_admin', 'teacher'].includes(role) ? role : 'teacher';
    if (finalRole !== 'super_admin' && !school_id)
      return res.status(400).json({ success: false, message: 'school_id wajib untuk akun school_admin/guru' });
  } else {
    // school_admin cuma boleh bikin akun guru di sekolahnya sendiri
    finalRole = 'teacher';
    school_id = req.account.school_id;
  }

  const [[existing]] = await pool.query('SELECT id FROM accounts WHERE username = ?', [username]);
  if (existing) return res.status(409).json({ success: false, message: `Username "${username}" sudah dipakai` });

  const hash = await bcrypt.hash(password, 10);
  const [result] = await pool.query(
    'INSERT INTO accounts (username, password_hash, role, school_id) VALUES (?, ?, ?, ?)',
    [username, hash, finalRole, finalRole === 'super_admin' ? null : school_id]
  );
  res.status(201).json({ success: true, data: { id: result.insertId, username, role: finalRole, school_id: school_id || null } });
});

// Helper: school_admin cuma boleh mengubah akun guru di sekolahnya sendiri
// (bukan sesama school_admin/super_admin, bukan akun di sekolah lain).
async function assertAccountAccess(req, accountId) {
  const [[acc]] = await pool.query('SELECT * FROM accounts WHERE id = ?', [accountId]);
  if (!acc) return { error: 404, message: 'Akun tidak ditemukan' };
  if (req.account.role === 'super_admin') return { acc };
  if (acc.role === 'teacher' && acc.school_id === req.account.school_id) return { acc };
  return { error: 403, message: 'Tidak punya akses untuk akun ini' };
}

// PUT /api/accounts/:id/reset-password (super_admin: semua; school_admin: guru di sekolahnya)
app.put('/api/accounts/:id/reset-password', requireAuth, requireAnyRole('super_admin', 'school_admin'), async (req, res) => {
  const check = await assertAccountAccess(req, req.params.id);
  if (check.error) return res.status(check.error).json({ success: false, message: check.message });
  const { new_password } = req.body || {};
  if (!new_password || new_password.length < 6)
    return res.status(400).json({ success: false, message: 'Password minimal 6 karakter' });
  const hash = await bcrypt.hash(new_password, 10);
  await pool.query('UPDATE accounts SET password_hash = ? WHERE id = ?', [hash, req.params.id]);
  res.json({ success: true, message: 'Password akun berhasil direset' });
});

// DELETE /api/accounts/:id (super_admin: semua; school_admin: guru di sekolahnya)
app.delete('/api/accounts/:id', requireAuth, requireAnyRole('super_admin', 'school_admin'), async (req, res) => {
  if (Number(req.params.id) === req.account.account_id)
    return res.status(400).json({ success: false, message: 'Tidak bisa menghapus akun sendiri' });
  const check = await assertAccountAccess(req, req.params.id);
  if (check.error) return res.status(check.error).json({ success: false, message: check.message });
  await pool.query('DELETE FROM accounts WHERE id = ?', [req.params.id]);
  res.json({ success: true, message: 'Akun dihapus' });
});

// ══════════════════════════════════════════════════════
// REST API — KELAS & SISWA (login siswa sungguhan)
// Guru mengelola kelasnya sendiri; super_admin bisa semua kelas.
// Password siswa dibuat guru (bukan self-registration) — cocok untuk pilot
// dengan peserta yang sudah diketahui, bukan pendaftaran publik terbuka.
// ══════════════════════════════════════════════════════

function generateStudentPassword() {
  // PIN 6 digit — cukup untuk siswa SMP, gampang dibagikan guru ke kelas,
  // bukan level keamanan akun staf (yang pakai password bebas + bcrypt sama).
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function assertClassAccess(req, classId) {
  const [[cls]] = await pool.query('SELECT * FROM classes WHERE id = ?', [classId]);
  if (!cls) return { error: 404, message: 'Kelas tidak ditemukan' };
  if (req.account.role === 'super_admin') return { cls };
  if (req.account.role === 'school_admin' && cls.school_id === req.account.school_id) return { cls };
  if (req.account.role === 'teacher' && cls.teacher_account_id === req.account.account_id) return { cls };
  return { error: 403, message: 'Bukan kelas Anda' };
}

// GET /api/classes — guru: kelasnya sendiri; school_admin: semua kelas di
// sekolahnya; super_admin: semua (bisa filter ?school_id=)
app.get('/api/classes', requireAuth, async (req, res) => {
  let sql = `
    SELECT c.*, s.name AS school_name, a.username AS teacher_username,
      (SELECT COUNT(*) FROM students st WHERE st.class_id = c.id) AS student_count
    FROM classes c
    JOIN schools s ON s.id = c.school_id
    JOIN accounts a ON a.id = c.teacher_account_id
    WHERE 1=1`;
  const params = [];
  if (req.account.role === 'super_admin') {
    if (req.query.school_id) { sql += ' AND c.school_id = ?'; params.push(req.query.school_id); }
  } else if (req.account.role === 'school_admin') {
    sql += ' AND c.school_id = ?';
    params.push(req.account.school_id);
  } else {
    sql += ' AND c.teacher_account_id = ?';
    params.push(req.account.account_id);
  }
  sql += ' ORDER BY c.created_at DESC';
  const [rows] = await pool.query(sql, params);
  res.json({ success: true, data: rows });
});

// POST /api/classes — guru membuat kelas untuk dirinya sendiri; school_admin
// membuat kelas untuk salah satu guru di sekolahnya (wajib pilih teacher_account_id)
app.post('/api/classes', requireAuth, async (req, res) => {
  if (req.account.role === 'super_admin')
    return res.status(400).json({ success: false, message: 'super_admin tidak mengajar kelas — buat lewat akun guru' });
  const { class_name, grade_level, academic_year } = req.body || {};
  if (!class_name) return res.status(400).json({ success: false, message: 'class_name wajib diisi' });

  let teacherAccountId = req.account.account_id;
  if (req.account.role === 'school_admin') {
    const requestedTeacherId = req.body?.teacher_account_id;
    if (!requestedTeacherId) return res.status(400).json({ success: false, message: 'teacher_account_id wajib dipilih' });
    const [[teacher]] = await pool.query(
      "SELECT id FROM accounts WHERE id = ? AND role = 'teacher' AND school_id = ?",
      [requestedTeacherId, req.account.school_id]
    );
    if (!teacher) return res.status(400).json({ success: false, message: 'Guru tidak ditemukan di sekolah ini' });
    teacherAccountId = teacher.id;
  }

  const [result] = await pool.query(
    'INSERT INTO classes (school_id, teacher_account_id, class_name, grade_level, academic_year) VALUES (?, ?, ?, ?, ?)',
    [req.account.school_id, teacherAccountId, class_name, grade_level || null, academic_year || null]
  );
  res.status(201).json({ success: true, data: { id: result.insertId, class_name } });
});

// DELETE /api/classes/:id
app.delete('/api/classes/:id', requireAuth, async (req, res) => {
  const check = await assertClassAccess(req, req.params.id);
  if (check.error) return res.status(check.error).json({ success: false, message: check.message });
  await pool.query('DELETE FROM classes WHERE id = ?', [req.params.id]);
  res.json({ success: true, message: 'Kelas dihapus (siswa di kelas ini tidak ikut terhapus)' });
});

// GET /api/classes/:id/students — roster satu kelas
app.get('/api/classes/:id/students', requireAuth, async (req, res) => {
  const check = await assertClassAccess(req, req.params.id);
  if (check.error) return res.status(check.error).json({ success: false, message: check.message });
  const [rows] = await pool.query(
    'SELECT id, name, student_number, created_at FROM students WHERE class_id = ? ORDER BY name', [req.params.id]
  );
  res.json({ success: true, data: rows });
});

// POST /api/classes/:id/students/bulk — tambah banyak siswa sekaligus.
// Body: { students: [{ name, student_number }, ...] }
// Password dibuat otomatis & DIKEMBALIKAN SEKALI di response ini saja (tidak
// disimpan plaintext) — guru harus salin/cetak sekarang untuk dibagikan.
app.post('/api/classes/:id/students/bulk', requireAuth, async (req, res) => {
  const check = await assertClassAccess(req, req.params.id);
  if (check.error) return res.status(check.error).json({ success: false, message: check.message });
  const list = Array.isArray(req.body?.students) ? req.body.students : [];
  if (list.length === 0) return res.status(400).json({ success: false, message: 'Kirim array "students" (minimal 1)' });

  const created = [];
  const skipped = [];
  for (const s of list) {
    const name = (s.name || '').trim();
    const studentNumber = (s.student_number || '').trim();
    if (!name || !studentNumber) { skipped.push({ ...s, reason: 'nama/nomor induk kosong' }); continue; }
    const [[existing]] = await pool.query(
      'SELECT id FROM students WHERE school_id = ? AND student_number = ?', [check.cls.school_id, studentNumber]
    );
    if (existing) { skipped.push({ ...s, reason: 'nomor induk sudah dipakai di sekolah ini' }); continue; }
    const plainPassword = generateStudentPassword();
    const hash = await bcrypt.hash(plainPassword, 10);
    const [result] = await pool.query(
      'INSERT INTO students (school_id, class_id, name, student_number, password_hash) VALUES (?, ?, ?, ?, ?)',
      [check.cls.school_id, req.params.id, name, studentNumber, hash]
    );
    created.push({ id: result.insertId, name, student_number: studentNumber, password: plainPassword });
  }
  res.status(201).json({ success: true, created, skipped });
});

// PUT /api/students/:id/reset-password
app.put('/api/students/:id/reset-password', requireAuth, async (req, res) => {
  const [[student]] = await pool.query('SELECT * FROM students WHERE id = ?', [req.params.id]);
  if (!student) return res.status(404).json({ success: false, message: 'Siswa tidak ditemukan' });
  const check = await assertClassAccess(req, student.class_id);
  if (check.error) return res.status(check.error).json({ success: false, message: check.message });
  const plainPassword = generateStudentPassword();
  const hash = await bcrypt.hash(plainPassword, 10);
  await pool.query('UPDATE students SET password_hash = ? WHERE id = ?', [hash, student.id]);
  res.json({ success: true, password: plainPassword });
});

// DELETE /api/students/:id
app.delete('/api/students/:id', requireAuth, async (req, res) => {
  const [[student]] = await pool.query('SELECT * FROM students WHERE id = ?', [req.params.id]);
  if (!student) return res.status(404).json({ success: false, message: 'Siswa tidak ditemukan' });
  const check = await assertClassAccess(req, student.class_id);
  if (check.error) return res.status(check.error).json({ success: false, message: check.message });
  await pool.query('DELETE FROM students WHERE id = ?', [student.id]);
  res.json({ success: true, message: 'Siswa dihapus' });
});

// POST /api/auth/student-login — login siswa sungguhan (nomor induk + password
// per sekolah). Terpisah dari /api/auth/login (staf) karena bentuk
// kredensialnya beda dan tidak perlu bcrypt-cost tinggi/JWT admin-level.
app.post('/api/auth/student-login', publicWriteLimiter, async (req, res) => {
  const { school_id, student_number, password } = req.body || {};
  if (!school_id || !student_number || !password)
    return res.status(400).json({ success: false, message: 'school_id, student_number, dan password wajib diisi' });

  const [[student]] = await pool.query(
    'SELECT * FROM students WHERE school_id = ? AND student_number = ?', [school_id, student_number]
  );
  if (!student) return res.status(401).json({ success: false, message: 'Nomor induk atau password salah' });
  const ok = await bcrypt.compare(password, student.password_hash);
  if (!ok) return res.status(401).json({ success: false, message: 'Nomor induk atau password salah' });

  const token = jwt.sign(
    { student_id: student.id, name: student.name, role: 'student', school_id: student.school_id, class_id: student.class_id },
    JWT_SECRET, { expiresIn: '12h' }
  );
  res.json({ success: true, token, name: student.name, class_id: student.class_id, school_id: student.school_id });
});

function requireStudent(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  const data = token ? verifyToken(token) : null;
  if (!data || data.role !== 'student')
    return res.status(401).json({ success: false, message: 'Unauthorized — login siswa terlebih dahulu' });
  req.student = data;
  next();
}

// GET /api/students/me/results — siswa melihat hasil belajarnya sendiri
// (sesi eksplorasi + akurasi kuis). Diskop lewat student_id dari token,
// bukan dari parameter — siswa tidak bisa melihat hasil siswa lain.
app.get('/api/students/me/results', requireStudent, async (req, res) => {
  const studentId = req.student.student_id;

  const [sessions] = await pool.query(`
    SELECT id, scene_name, started_at, ended_at, duration_seconds
    FROM sessions WHERE student_id = ? ORDER BY started_at DESC LIMIT 50
  `, [studentId]);

  const [[quizTotals]] = await pool.query(`
    SELECT COUNT(*) AS total_attempts,
      SUM(q.is_correct) AS total_correct,
      ROUND(100.0 * SUM(q.is_correct) / COUNT(*), 1) AS accuracy_pct
    FROM quiz_results q JOIN sessions s ON s.id = q.session_id
    WHERE s.student_id = ?
  `, [studentId]);

  const [perQuestion] = await pool.query(`
    SELECT q.question_id, q.answer, q.is_correct, q.created_at
    FROM quiz_results q JOIN sessions s ON s.id = q.session_id
    WHERE s.student_id = ? ORDER BY q.created_at DESC LIMIT 50
  `, [studentId]);

  const [[interactionTotals]] = await pool.query(`
    SELECT COUNT(*) AS total_interactions
    FROM interactions i JOIN sessions s ON s.id = i.session_id
    WHERE s.student_id = ?
  `, [studentId]);

  res.json({
    success: true,
    data: {
      name: req.student.name,
      totals: {
        total_sessions: sessions.length,
        total_quiz_attempts: quizTotals.total_attempts || 0,
        quiz_accuracy_pct: quizTotals.accuracy_pct || 0,
        total_interactions: interactionTotals.total_interactions || 0,
      },
      sessions, perQuestion,
    },
  });
});

// ══════════════════════════════════════════════════════
// REST API — SCENES (CRUD)
// ══════════════════════════════════════════════════════

// GET /api/scenes
app.get('/api/scenes', (req, res) => {
  const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json'));
  const scenes = files
    .map(f => readScene(path.basename(f, '.json')))
    // data/ juga menyimpan config non-scene (geometry-labels.json, quiz.json,
    // tour-borobudur.json) — hanya file berbentuk scene (scene_id + objects[])
    // yang dianggap scene oleh admin panel.
    .filter(data => data && typeof data.scene_id === 'string' && Array.isArray(data.objects))
    .map(data => ({ scene_id: data.scene_id, name: data.name, location: data.location, era: data.era, obj_count: data.objects.length }));
  res.json({ success: true, data: scenes });
});

// GET /api/scenes/:id
app.get('/api/scenes/:id', (req, res) => {
  const data = readScene(req.params.id);
  if (!data) return res.status(404).json({ success: false, message: 'Scene tidak ditemukan' });
  res.json({ success: true, data });
});

// POST /api/scenes — buat scene baru (auth required)
app.post('/api/scenes', requireAuth, requireRole('super_admin'), (req, res) => {
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
app.put('/api/scenes/:id', requireAuth, requireRole('super_admin'), (req, res) => {
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
app.delete('/api/scenes/:id', requireAuth, requireRole('super_admin'), (req, res) => {
  const id = req.params.id;
  if (['prambanan'].includes(id))
    return res.status(403).json({ success: false, message: 'Scene default tidak bisa dihapus' });
  const file = path.join(DATA_DIR, `${id}.json`);
  if (!fs.existsSync(file)) return res.status(404).json({ success: false, message: 'Scene tidak ditemukan' });
  fs.unlinkSync(file);
  const pubFile = path.join(PUBLIC_DIR, 'data', `${id}.json`);
  if (fs.existsSync(pubFile)) fs.unlinkSync(pubFile);
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

app.post('/api/scenes/:id/objects', requireAuth, requireRole('super_admin'), (req, res) => {
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

app.put('/api/scenes/:id/objects/:objId', requireAuth, requireRole('super_admin'), (req, res) => {
  const data = readScene(req.params.id);
  if (!data) return res.status(404).json({ success: false, message: 'Scene tidak ditemukan' });
  const idx = data.objects.findIndex(o => o.id === req.params.objId);
  if (idx < 0) return res.status(404).json({ success: false, message: 'Objek tidak ditemukan' });
  data.objects[idx] = { ...data.objects[idx], ...req.body, id: req.params.objId };
  writeScene(req.params.id, data);
  res.json({ success: true, data: data.objects[idx] });
});

app.delete('/api/scenes/:id/objects/:objId', requireAuth, requireRole('super_admin'), (req, res) => {
  const data = readScene(req.params.id);
  if (!data) return res.status(404).json({ success: false, message: 'Scene tidak ditemukan' });
  const before = data.objects.length;
  data.objects = data.objects.filter(o => o.id !== req.params.objId);
  if (data.objects.length === before)
    return res.status(404).json({ success: false, message: 'Objek tidak ditemukan' });
  writeScene(req.params.id, data);
  res.json({ success: true, message: `Objek "${req.params.objId}" berhasil dihapus` });
});

// ══════════════════════════════════════════════════════
// REST API — DATASET ML (capture crop dari tur 360°)
// ══════════════════════════════════════════════════════

function readGeometryClassIds() {
  const file = path.join(DATA_DIR, 'geometry-labels.json');
  if (!fs.existsSync(file)) return [];
  const json = JSON.parse(fs.readFileSync(file, 'utf8'));
  return (json.classes || []).map(c => c.class_id);
}

// POST /api/dataset/:classId — simpan crop hasil capture dari tur 360° (auth required)
// Body: raw image bytes (Content-Type: image/jpeg atau image/png), max 5MB.
app.post('/api/dataset/:classId', requireAuth, requireRole('super_admin'), (req, res) => {
  const classId = req.params.classId;
  const validIds = readGeometryClassIds();
  if (!validIds.includes(classId))
    return res.status(400).json({ success: false, message: `class_id "${classId}" tidak dikenal. Valid: ${validIds.join(', ')}` });

  const chunks = [];
  req.on('data', chunk => chunks.push(chunk));
  req.on('end', () => {
    try {
      const buf = Buffer.concat(chunks);
      if (buf.length > 5 * 1024 * 1024)
        return res.status(413).json({ success: false, message: 'Gambar maksimal 5MB' });

      const ct = req.headers['content-type'] || '';
      const ext = ct.includes('png') ? 'png' : 'jpg';
      const classDir = path.join(DATASET_DIR, 'train', classId);
      if (!fs.existsSync(classDir)) fs.mkdirSync(classDir, { recursive: true });

      const existing = fs.readdirSync(classDir).filter(f => f.endsWith('.jpg') || f.endsWith('.png'));
      const nextIndex = existing.length + 1;
      const filename = `${classId}_${String(nextIndex).padStart(4, '0')}.${ext}`;
      fs.writeFileSync(path.join(classDir, filename), buf);

      res.status(201).json({ success: true, filename, class_id: classId, total: nextIndex });
    } catch (e) {
      res.status(500).json({ success: false, message: e.message });
    }
  });
});

// GET /api/dataset/stats — hitung jumlah gambar per kelas (train/val/test)
app.get('/api/dataset/stats', (req, res) => {
  const validIds = readGeometryClassIds();
  const stats = validIds.map(classId => {
    const counts = {};
    ['train', 'val', 'test'].forEach(split => {
      const dir = path.join(DATASET_DIR, split, classId);
      counts[split] = fs.existsSync(dir)
        ? fs.readdirSync(dir).filter(f => f.endsWith('.jpg') || f.endsWith('.png')).length
        : 0;
    });
    return { class_id: classId, ...counts, total: counts.train + counts.val + counts.test };
  });
  res.json({ success: true, data: stats });
});

// ══════════════════════════════════════════════════════
// REST API — TUR 360° (identifikasi geometri per area, multi-tur)
// Setiap situs dengan foto 360° punya file data/tour-<id>.json sendiri
// (mis. tour-borobudur.json). Endpoint di sini generik lewat :tourId,
// bukan hardcode satu situs — tur baru (mis. Prambanan) otomatis muncul
// begitu file datanya ada, tanpa perlu ubah kode.
// ══════════════════════════════════════════════════════

function readTour(tourId) {
  const file = path.join(DATA_DIR, `tour-${tourId}.json`);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
function writeTour(tourId, data) {
  const json = JSON.stringify(data, null, 2);
  fs.writeFileSync(path.join(DATA_DIR, `tour-${tourId}.json`), json, 'utf8');
  const pubDataDir = path.join(PUBLIC_DIR, 'data');
  if (!fs.existsSync(pubDataDir)) fs.mkdirSync(pubDataDir, { recursive: true });
  fs.writeFileSync(path.join(pubDataDir, `tour-${tourId}.json`), json, 'utf8');
}

// GET /api/tours — daftar semua tur 360° yang ada (untuk admin & portal)
app.get('/api/tours', (req, res) => {
  const files = fs.readdirSync(DATA_DIR).filter(f => /^tour-.+\.json$/.test(f));
  const tours = files.map(f => {
    const tourId = f.replace(/^tour-/, '').replace(/\.json$/, '');
    const data = readTour(tourId);
    if (!data) return null;
    return {
      tour_id: tourId,
      name: data.name || tourId,
      source: data.source || '',
      node_count: (data.nodes || []).length,
      identified_count: (data.nodes || []).filter(n => n.identify).length,
      area_count: (data.folder_order || []).length,
    };
  }).filter(Boolean);
  res.json({ success: true, data: tours });
});

// PUT /api/tour/:tourId/folder/:folder — set/hapus identifikasi geometri
// untuk semua node di satu area sekaligus (auth required).
// Body: { class_id: string|null, element?: string, context?: string, conf?: number }
app.put('/api/tour/:tourId/folder/:folder', requireAuth, requireRole('super_admin'), (req, res) => {
  const tour = readTour(req.params.tourId);
  if (!tour) return res.status(404).json({ success: false, message: 'Tur tidak ditemukan' });

  const folder = decodeURIComponent(req.params.folder);
  const nodesInFolder = tour.nodes.filter(n => n.folder === folder);
  if (nodesInFolder.length === 0)
    return res.status(404).json({ success: false, message: `Area "${folder}" tidak ditemukan` });

  const { class_id, element, context, conf } = req.body || {};
  if (!class_id) {
    nodesInFolder.forEach(n => delete n.identify);
  } else {
    const labelsFile = path.join(DATA_DIR, 'geometry-labels.json');
    const classes = fs.existsSync(labelsFile) ? JSON.parse(fs.readFileSync(labelsFile, 'utf8')).classes : [];
    const cls = classes.find(c => c.class_id === class_id);
    if (!cls) return res.status(400).json({ success: false, message: `class_id "${class_id}" tidak dikenal` });

    const identify = {
      class_id: cls.class_id,
      object_id: null,
      geo: cls.label_id, geo_en: cls.label_en,
      sisi: cls.sisi, rusuk: cls.rusuk, titik: cls.titik,
      volume: cls.volume, luas: cls.luas,
      element: element || cls.label_id,
      context: context || '',
      conf: typeof conf === 'number' ? conf : 85,
      local_angle: 40.0,
    };
    nodesInFolder.forEach(n => n.identify = identify);
  }

  writeTour(req.params.tourId, tour);
  res.json({ success: true, folder, applied_to: nodesInFolder.length, identify: nodesInFolder[0].identify || null });
});

// ══════════════════════════════════════════════════════
// REST API — ML SERVER-SIDE (inferensi resmi, bukan hasil browser klien)
// ══════════════════════════════════════════════════════

// POST /api/ml/predict/:tourId/:nodeId — server crop foto panorama dari
// disk sendiri (tidak perlu upload gambar) lalu jalankan model TF.js
// (@tensorflow/tfjs-node) untuk prediksi kelas geometri.
app.post('/api/ml/predict/:tourId/:nodeId', publicWriteLimiter, async (req, res) => {
  try {
    const result = await mlPredict.predictNode(req.params.tourId, req.params.nodeId);
    res.json({ success: true, data: result });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ══════════════════════════════════════════════════════
// REST API — SESI SISWA, INTERAKSI, PREDIKSI, KUIS
// (log aktivitas siswa selama eksplorasi — dasar laporan guru)
// ══════════════════════════════════════════════════════

// Token siswa opsional: kalau dikirim & valid, sesi tercatat sebagai siswa
// sungguhan (student_id + class_id terisi) — kalau tidak ada/tidak valid,
// tetap jalan mode anonim seperti sebelumnya (nama bebas, tanpa akun) supaya
// demo publik/GitHub Pages tidak mendadak butuh akun.
function getOptionalStudent(req) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return null;
  const data = verifyToken(token);
  return data && data.role === 'student' ? data : null;
}

// POST /api/sessions — mulai sesi eksplorasi
app.post('/api/sessions', publicWriteLimiter, async (req, res) => {
  const student = getOptionalStudent(req);
  const { student_name, role, school_id, scene_name, device_type } = req.body || {};

  const name = student ? student.name : (student_name || 'Anonim').trim().slice(0, 100);
  const effectiveSchool = student ? student.school_id : (school_id || null);
  const classId = student ? student.class_id : null;

  const [userResult] = await pool.query(
    'INSERT INTO users (name, role, school_id) VALUES (?, ?, ?)',
    [name, role || 'siswa', effectiveSchool]
  );
  const [sessionResult] = await pool.query(
    'INSERT INTO sessions (user_id, student_id, school_id, class_id, scene_name, device_type) VALUES (?, ?, ?, ?, ?, ?)',
    [userResult.insertId, student ? student.student_id : null, effectiveSchool, classId, scene_name || 'borobudur-360', device_type || 'desktop']
  );
  res.status(201).json({ success: true, session_id: sessionResult.insertId });
});

// PUT /api/sessions/:id/end — tutup sesi, hitung durasi
app.put('/api/sessions/:id/end', publicWriteLimiter, async (req, res) => {
  const [[row]] = await pool.query('SELECT started_at FROM sessions WHERE id = ?', [req.params.id]);
  if (!row) return res.status(404).json({ success: false, message: 'Sesi tidak ditemukan' });
  await pool.query(
    `UPDATE sessions SET ended_at = NOW(), duration_seconds = TIMESTAMPDIFF(SECOND, started_at, NOW()) WHERE id = ?`,
    [req.params.id]
  );
  res.json({ success: true });
});

// POST /api/interactions — log gaze/klik pada area tur
app.post('/api/interactions', publicWriteLimiter, async (req, res) => {
  const { session_id, object_code, object_name, geometry_label, interaction_type, gaze_duration } = req.body || {};
  if (!session_id || !object_code)
    return res.status(400).json({ success: false, message: 'session_id dan object_code wajib diisi' });
  const objectId = await upsertObject({ object_code, object_name, geometry_label });
  await pool.query(
    'INSERT INTO interactions (session_id, object_id, interaction_type, gaze_duration) VALUES (?, ?, ?, ?)',
    [session_id, objectId, interaction_type || 'visit', gaze_duration || null]
  );
  res.status(201).json({ success: true });
});

// POST /api/predictions — log identifikasi geometri (hasil ML)
app.post('/api/predictions', publicWriteLimiter, async (req, res) => {
  const { session_id, object_code, object_name, geometry_label, predicted_label, confidence_score } = req.body || {};
  if (!session_id || !object_code)
    return res.status(400).json({ success: false, message: 'session_id dan object_code wajib diisi' });
  const objectId = await upsertObject({ object_code, object_name, geometry_label });
  await pool.query(
    'INSERT INTO predictions (session_id, object_id, predicted_label, confidence_score) VALUES (?, ?, ?, ?)',
    [session_id, objectId, predicted_label || '', confidence_score || 0]
  );
  res.status(201).json({ success: true });
});

// POST /api/quiz-results — log jawaban kuis
app.post('/api/quiz-results', publicWriteLimiter, async (req, res) => {
  const { session_id, question_id, answer, is_correct, response_time } = req.body || {};
  if (!session_id || !question_id)
    return res.status(400).json({ success: false, message: 'session_id dan question_id wajib diisi' });
  await pool.query(
    'INSERT INTO quiz_results (session_id, question_id, answer, is_correct, response_time) VALUES (?, ?, ?, ?, ?)',
    [session_id, question_id, answer || '', is_correct ? 1 : 0, response_time || null]
  );
  res.status(201).json({ success: true });
});

// GET /api/reports/summary — rekap untuk guru (auth required, diskop per
// sekolah, dengan filter opsional per kelas)
app.get('/api/reports/summary', requireAuth, async (req, res) => {
  const schoolId = effectiveSchoolId(req, req.query.school_id);
  const classId = req.query.class_id ? Number(req.query.class_id) : null;

  const clauses = [];
  const filterParams = [];
  if (schoolId) { clauses.push('s.school_id = ?'); filterParams.push(schoolId); }
  if (classId)  { clauses.push('s.class_id = ?');  filterParams.push(classId); }
  const filterSql = clauses.length ? 'AND ' + clauses.join(' AND ') : '';
  const params = filterParams;

  const [[totals]] = await pool.query(`
    SELECT
      (SELECT COUNT(*) FROM sessions s WHERE 1=1 ${filterSql}) AS total_sessions,
      (SELECT COUNT(DISTINCT s.user_id) FROM sessions s WHERE 1=1 ${filterSql}) AS total_students,
      (SELECT ROUND(AVG(s.duration_seconds)) FROM sessions s WHERE s.duration_seconds IS NOT NULL ${filterSql}) AS avg_duration_seconds,
      (SELECT COUNT(*) FROM quiz_results q JOIN sessions s ON s.id = q.session_id WHERE 1=1 ${filterSql}) AS total_quiz_attempts,
      (SELECT ROUND(100.0 * SUM(q.is_correct) / COUNT(*), 1) FROM quiz_results q JOIN sessions s ON s.id = q.session_id WHERE 1=1 ${filterSql}) AS quiz_accuracy_pct,
      (SELECT COUNT(*) FROM interactions i JOIN sessions s ON s.id = i.session_id WHERE 1=1 ${filterSql}) AS total_interactions
  `, [...params, ...params, ...params, ...params, ...params, ...params]);

  const [perQuestion] = await pool.query(`
    SELECT q.question_id,
      COUNT(*) AS attempts,
      SUM(q.is_correct) AS correct,
      ROUND(100.0 * SUM(q.is_correct) / COUNT(*), 1) AS accuracy_pct,
      ROUND(AVG(q.response_time), 1) AS avg_response_time
    FROM quiz_results q JOIN sessions s ON s.id = q.session_id
    WHERE 1=1 ${filterSql}
    GROUP BY q.question_id ORDER BY q.question_id
  `, params);

  // Rekap per konsep geometri (bukan per soal) — dipetakan dari quiz.json,
  // dipakai dashboard guru untuk rekomendasi tindak lanjut per konsep.
  const conceptTotals = {};
  perQuestion.forEach(q => {
    const concept = questionIdToConcept(q.question_id);
    if (!concept) return;
    if (!conceptTotals[concept]) conceptTotals[concept] = { attempts: 0, correct: 0 };
    conceptTotals[concept].attempts += q.attempts;
    conceptTotals[concept].correct  += Number(q.correct);
  });
  const conceptRecommendations = Object.entries(conceptTotals).map(([label, t]) => {
    const accuracyPct = Math.round((t.correct / t.attempts) * 1000) / 10;
    return {
      geometry_label: label,
      geometry_name: GEOMETRY_LABELS_ID[label] || label,
      attempts: t.attempts, correct: t.correct, accuracy_pct: accuracyPct,
      recommendation: conceptRecommendation(label, accuracyPct, t.attempts),
    };
  }).sort((a, b) => a.accuracy_pct - b.accuracy_pct);

  const [perObject] = await pool.query(`
    SELECT o.object_code, o.geometry_label, COUNT(*) AS interaction_count
    FROM interactions i
    JOIN objects o ON o.id = i.object_id
    JOIN sessions s ON s.id = i.session_id
    WHERE 1=1 ${filterSql}
    GROUP BY o.object_code, o.geometry_label ORDER BY interaction_count DESC
  `, params);

  const [perSchool] = req.account.role === 'super_admin'
    ? await pool.query(`
        SELECT sc.id AS school_id, sc.name AS school_name, COUNT(*) AS session_count
        FROM sessions s LEFT JOIN schools sc ON sc.id = s.school_id
        GROUP BY sc.id, sc.name ORDER BY session_count DESC
      `)
    : [[]];

  // Kelas dalam cakupan (guru: kelasnya sendiri; school_admin: semua kelas
  // di sekolahnya; super_admin: kelas di sekolah yang sedang difilter, atau
  // semua kalau tidak difilter) — dipakai dropdown filter kelas di dashboard,
  // dan rekap sesi per kelas.
  let classScopeSql = 'SELECT id, class_name FROM classes WHERE 1=1';
  const classScopeParams = [];
  if (req.account.role === 'teacher') {
    classScopeSql += ' AND teacher_account_id = ?';
    classScopeParams.push(req.account.account_id);
  } else if (schoolId) {
    classScopeSql += ' AND school_id = ?';
    classScopeParams.push(schoolId);
  }
  const [availableClasses] = await pool.query(classScopeSql + ' ORDER BY class_name', classScopeParams);

  const teacherScoped = req.account.role === 'teacher';
  const [perClass] = await pool.query(`
    SELECT c.id AS class_id, c.class_name, COUNT(s.id) AS session_count
    FROM classes c LEFT JOIN sessions s ON s.class_id = c.id
    WHERE 1=1 ${schoolId ? 'AND c.school_id = ?' : ''} ${teacherScoped ? 'AND c.teacher_account_id = ?' : ''}
    GROUP BY c.id, c.class_name ORDER BY session_count DESC
  `, [...(schoolId ? [schoolId] : []), ...(teacherScoped ? [req.account.account_id] : [])]);

  // Pagination pada sesi terbaru — penting begitu volume data tumbuh (ratusan/ribuan siswa)
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize) || 20));
  const offset = (page - 1) * pageSize;

  const [[{ total: sessionTotal }]] = await pool.query(
    `SELECT COUNT(*) AS total FROM sessions s WHERE 1=1 ${filterSql}`, params
  );
  const [recentSessions] = await pool.query(`
    SELECT s.id, u.name AS student_name, sc.name AS school_name, cl.class_name, s.scene_name, s.started_at, s.duration_seconds
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    LEFT JOIN schools sc ON sc.id = s.school_id
    LEFT JOIN classes cl ON cl.id = s.class_id
    WHERE 1=1 ${filterSql}
    ORDER BY s.started_at DESC LIMIT ? OFFSET ?
  `, [...params, pageSize, offset]);

  res.json({
    success: true,
    data: {
      totals, perQuestion, perObject, perSchool, perClass, availableClasses, recentSessions, conceptRecommendations,
      pagination: { page, pageSize, total: sessionTotal, totalPages: Math.ceil(sessionTotal / pageSize) },
    },
  });
});

// GET /api/reports/export.csv — ekspor sesi untuk analisis offline (auth, diskop per sekolah)
app.get('/api/reports/export.csv', requireAuth, async (req, res) => {
  const schoolId = effectiveSchoolId(req, req.query.school_id);
  const classId = req.query.class_id ? Number(req.query.class_id) : null;
  const clauses = [];
  const params = [];
  if (schoolId) { clauses.push('s.school_id = ?'); params.push(schoolId); }
  if (classId)  { clauses.push('s.class_id = ?');  params.push(classId); }
  const filterSql = clauses.length ? 'AND ' + clauses.join(' AND ') : '';

  const [rows] = await pool.query(`
    SELECT s.id, u.name AS student_name, sc.name AS school_name, cl.class_name, s.scene_name,
      s.started_at, s.ended_at, s.duration_seconds, s.device_type
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    LEFT JOIN schools sc ON sc.id = s.school_id
    LEFT JOIN classes cl ON cl.id = s.class_id
    WHERE 1=1 ${filterSql}
    ORDER BY s.started_at DESC
  `, params);

  const header = 'id,student_name,school_name,class_name,scene_name,started_at,ended_at,duration_seconds,device_type';
  const csvEscape = (v) => v == null ? '' : `"${String(v).replace(/"/g, '""')}"`;
  const lines = rows.map(r => [r.id, r.student_name, r.school_name, r.class_name, r.scene_name, r.started_at, r.ended_at, r.duration_seconds, r.device_type].map(csvEscape).join(','));
  const csv = [header, ...lines].join('\n');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="vr-geonusa-sessions.csv"');
  res.send(csv);
});

// ══════════════════════════════════════════════════════
// REST API — TIM PENELITI
// ══════════════════════════════════════════════════════

function readTeam() {
  if (!fs.existsSync(TEAM_FILE)) return [];
  return JSON.parse(fs.readFileSync(TEAM_FILE, 'utf8'));
}
function writeTeam(data) {
  fs.writeFileSync(TEAM_FILE, JSON.stringify(data, null, 2), 'utf8');
  // Sync ke public/data/ untuk GitHub Pages
  const pubFile = path.join(PUBLIC_DIR, 'data', 'team.json');
  fs.writeFileSync(pubFile, JSON.stringify(data, null, 2), 'utf8');
}

// GET /api/team
app.get('/api/team', (req, res) => {
  res.json({ success: true, data: readTeam() });
});

// POST /api/team — tambah anggota
app.post('/api/team', requireAuth, requireRole('super_admin'), (req, res) => {
  const team = readTeam();
  const member = req.body;
  if (!member.id || !member.name)
    return res.status(400).json({ success: false, message: 'id dan name wajib diisi' });
  if (team.find(m => m.id === member.id))
    return res.status(409).json({ success: false, message: `ID "${member.id}" sudah ada` });
  member.order = member.order ?? (team.length + 1);
  team.push(member);
  writeTeam(team);
  res.status(201).json({ success: true, data: member });
});

// PUT /api/team/:id — update anggota
app.put('/api/team/:id', requireAuth, requireRole('super_admin'), (req, res) => {
  const team = readTeam();
  const idx = team.findIndex(m => m.id === req.params.id);
  if (idx < 0) return res.status(404).json({ success: false, message: 'Anggota tidak ditemukan' });
  team[idx] = { ...team[idx], ...req.body, id: req.params.id };
  writeTeam(team);
  res.json({ success: true, data: team[idx] });
});

// DELETE /api/team/:id
app.delete('/api/team/:id', requireAuth, requireRole('super_admin'), (req, res) => {
  const team = readTeam();
  const before = team.length;
  const filtered = team.filter(m => m.id !== req.params.id);
  if (filtered.length === before)
    return res.status(404).json({ success: false, message: 'Anggota tidak ditemukan' });
  writeTeam(filtered);
  res.json({ success: true, message: `Anggota "${req.params.id}" dihapus` });
});

// PATCH /api/team/reorder — ubah urutan
app.patch('/api/team/reorder', requireAuth, requireRole('super_admin'), (req, res) => {
  const { order } = req.body;
  if (!Array.isArray(order)) return res.status(400).json({ success: false, message: 'Kirim array "order"' });
  const team = readTeam();
  team.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  team.forEach((m, i) => m.order = i + 1);
  writeTeam(team);
  res.json({ success: true, data: team });
});

// POST /api/team/:id/photo — upload foto anggota (multipart, max 2MB)
app.post('/api/team/:id/photo', requireAuth, requireRole('super_admin'), (req, res) => {
  const team = readTeam();
  const member = team.find(m => m.id === req.params.id);
  if (!member) return res.status(404).json({ success: false, message: 'Anggota tidak ditemukan' });

  const chunks = [];
  req.on('data', chunk => chunks.push(chunk));
  req.on('end', () => {
    try {
      const buf = Buffer.concat(chunks);
      if (buf.length > 3 * 1024 * 1024)
        return res.status(413).json({ success: false, message: 'Foto maksimal 3MB' });

      const ct = req.headers['content-type'] || '';
      const ext = ct.includes('png') ? 'png' : ct.includes('webp') ? 'webp' : 'jpg';
      const filename = `${req.params.id}.${ext}`;
      const teamImgDir = path.join(PUBLIC_DIR, 'assets', 'images', 'team');
      if (!fs.existsSync(teamImgDir)) fs.mkdirSync(teamImgDir, { recursive: true });
      fs.writeFileSync(path.join(teamImgDir, filename), buf);

      const photoPath = `/assets/images/team/${filename}`;
      const idx = team.findIndex(m => m.id === req.params.id);
      team[idx].photo = photoPath;
      writeTeam(team);
      res.json({ success: true, photo: photoPath });
    } catch(e) {
      res.status(500).json({ success: false, message: e.message });
    }
  });
});

// ── Health check ─────────────────────────────────────
app.get('/api/health', async (req, res) => {
  const [[{ ok }]] = await pool.query('SELECT 1 AS ok');
  res.json({ success: true, message: 'VR-GeoNusa server running', version: '2.0.0', db: ok === 1 ? 'connected' : 'error',
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
initDb().then(() => {
  app.listen(PORT, () => {
    console.log(`\n🏛️  VR-GeoNusa Server v2.0 (MySQL + multi-sekolah + ML server-side)`);
    console.log(`   Portal   → http://localhost:${PORT}`);
    console.log(`   Admin    → http://localhost:${PORT}/admin`);
    console.log(`   API      → http://localhost:${PORT}/api/scenes`);
    console.log(`   DB       → ${process.env.DB_NAME}@${process.env.DB_HOST}\n`);
  });
  // Model dimuat setelah server mulai jalan (tidak blokir startup) — endpoint
  // /api/ml/predict akan mengembalikan error singkat sampai model siap.
  mlPredict.loadModel().catch(err => console.error('⚠️  Gagal memuat model ML server-side:', err.message));
}).catch(err => {
  console.error('❌ Gagal konek/inisialisasi database:', err.message);
  process.exit(1);
});
