// VR-GeoNusa — Express Backend Server
// Menjalankan frontend statis + REST API + Auth (multi-sekolah) + MySQL

require('esbuild-register/dist/node').register({ target: 'node22' });
require('dotenv').config();

const express      = require('express');
const cors         = require('cors');
const crypto       = require('crypto');
const fs           = require('fs');
const path         = require('path');
const bcrypt       = require('bcryptjs');
const jwt          = require('jsonwebtoken');
const helmet       = require('helmet');
const { createApp } = require('./src/app');
const { runtimeEnv } = require('./src/config/env');
const { createPaths } = require('./src/config/paths');
const { createDatabasePool } = require('./src/db/client');
const { createAuthentication } = require('./src/middleware/authenticate');
const { requireAnyRole, requireRole } = require('./src/middleware/authorize');
const { errorHandler } = require('./src/middleware/error-handler');
const { createAuthRepository } = require('./src/modules/auth/auth.repository');
const { createAuthService } = require('./src/modules/auth/auth.service');
const { createAuthRouter } = require('./src/modules/auth/auth.router');
const { createSchoolsRepository } = require('./src/modules/schools/schools.repository');
const { createSchoolsService } = require('./src/modules/schools/schools.service');
const { createSchoolsRouter } = require('./src/modules/schools/schools.router');
const { createAccountsRepository } = require('./src/modules/accounts/accounts.repository');
const { createAccountsService } = require('./src/modules/accounts/accounts.service');
const { createAccountsRouter } = require('./src/modules/accounts/accounts.router');
const { createClassesRepository } = require('./src/modules/classes/classes.repository');
const { createClassesService } = require('./src/modules/classes/classes.service');
const { createClassesRouter } = require('./src/modules/classes/classes.router');
const { createStudentsRepository } = require('./src/modules/students/students.repository');
const { createStudentsService } = require('./src/modules/students/students.service');
const { createStudentsRouter } = require('./src/modules/students/students.router');
const { createSessionsRepository } = require('./src/modules/sessions/sessions.repository');
const { createSessionsService } = require('./src/modules/sessions/sessions.service');
const { createSessionsRouter } = require('./src/modules/sessions/sessions.router');
const {
  createLearningEventsRepository,
} = require('./src/modules/learning-events/learning-events.repository');
const {
  createLearningEventsService,
} = require('./src/modules/learning-events/learning-events.service');
const {
  createLearningEventsRouter,
} = require('./src/modules/learning-events/learning-events.router');
const { createScenesRepository } = require('./src/modules/scenes/scenes.repository');
const { createScenesService } = require('./src/modules/scenes/scenes.service');
const { createScenesRouter } = require('./src/modules/scenes/scenes.router');
const {
  escapeGeneratedHtml,
  serializeInlineScriptValue,
} = require('./src/modules/scenes/scenes.renderer');
const { createObjectsRepository } = require('./src/modules/objects/objects.repository');
const { createObjectsService } = require('./src/modules/objects/objects.service');
const { createObjectsRouter } = require('./src/modules/objects/objects.router');
const { createToursRepository } = require('./src/modules/tours/tours.repository');
const { createToursService } = require('./src/modules/tours/tours.service');
const { createToursRouter } = require('./src/modules/tours/tours.router');
const { createDatasetRepository } = require('./src/modules/dataset/dataset.repository');
const { createDatasetService } = require('./src/modules/dataset/dataset.service');
const { createDatasetRouter } = require('./src/modules/dataset/dataset.router');
const { createReportsRepository } = require('./src/modules/reports/reports.repository');
const { createReportsService } = require('./src/modules/reports/reports.service');
const { createReportsRouter } = require('./src/modules/reports/reports.router');
const {
  createPublicWriteLimiter,
  createStaffLoginLimiter,
} = require('./src/middleware/rate-limit');
const { startHttpServer } = require('./src/server');
const {
  assertFileIdentifier,
  InvalidFilePathError,
  resolveWithin,
} = require('./src/shared/ids');

const app = createApp();
const PORT = runtimeEnv.PORT;

// Satu request yang error (mis. query DB gagal) sebelumnya bisa menjatuhkan
// SELURUH server — fatal untuk pilot dengan banyak peserta bersamaan, karena
// satu siswa bermasalah akan memutus sesi semua siswa lain. Log saja, jangan
// exit proses.
process.on('unhandledRejection', (err) => {
  console.error('Unhandled promise rejection (server tetap jalan):', err);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception (server tetap jalan):', err);
});

const runtimePaths = createPaths(__dirname);
const DATA_DIR = runtimePaths.dataDir;
const PUBLIC_DIR = runtimePaths.publicDir;
const VR_DIR = runtimePaths.vrDir;
const CONFIG_DIR = runtimePaths.configDir;
const DATASET_DIR = runtimePaths.datasetDir;
const TEAM_FILE = runtimePaths.teamFile;

// ── JWT secret — auto-generate & persist lokal jika belum ada (kredensial
// database TETAP harus diisi manual lewat .env, ini cuma untuk menandatangani
// token, bukan rahasia yang perlu dibagi antar admin) ──
const secretFile = runtimePaths.jwtSecretFile;
if (!fs.existsSync(secretFile)) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(secretFile, crypto.randomBytes(32).toString('hex'));
}
const JWT_SECRET = fs.readFileSync(secretFile, 'utf8').trim();

// ── Database (MySQL/MariaDB) ──────────────────────────
const pool = createDatabasePool(runtimeEnv);
app.locals.dbPool = pool;

let mlProvider = null;
let mlLoadPromise = null;

// Module ML memuat native TensorFlow binding pada require-time. Load module
// dan model hanya setelah server siap atau ketika endpoint ML pertama dipanggil.
function initializeMlProvider() {
  if (mlProvider) return Promise.resolve(mlProvider);
  if (!mlLoadPromise) {
    mlLoadPromise = Promise.resolve()
      .then(() => require('./ml/predict'))
      .then(async provider => {
        await provider.loadModel();
        mlProvider = provider;
        return provider;
      })
      .catch(error => {
        // Izinkan percobaan ulang pada request/startup berikutnya.
        mlLoadPromise = null;
        throw error;
      });
  }
  return mlLoadPromise;
}

function logMlInitializationError(error, logger = app.locals.logger) {
  logger.error('Gagal memuat model ML server-side:', error.message);
}

// `CREATE TABLE IF NOT EXISTS` tidak menambah kolom baru ke tabel yang sudah
// ada dari deploy sebelumnya (mis. `sessions` sudah ada sebelum kolom
// student_id/class_id ditambahkan ke schema.mysql.sql) — jadi kolom baru
// perlu ditambah manual lewat migrasi kecil ini, dicek dulu supaya aman
// dijalankan berkali-kali (idempotent) di semua versi MySQL/MariaDB.
async function ensureColumn(table, column, definition, {
  dbPool = pool,
  env = runtimeEnv,
  logger = console,
} = {}) {
  const [rows] = await dbPool.query(
    `SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [env.DB_NAME, table, column]
  );
  if (rows[0].cnt === 0) {
    await dbPool.query(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
    logger.log(`Migrasi: kolom "${column}" ditambahkan ke tabel "${table}"`);
  }
}

// Sama seperti ensureColumn — ALTER TABLE ... MODIFY COLUMN untuk menambah
// nilai ENUM baru ('school_admin') ke deploy lama yang masih pakai ENUM lama.
async function ensureAccountsRoleEnum({
  dbPool = pool,
  env = runtimeEnv,
  logger = console,
} = {}) {
  const [[row]] = await dbPool.query(
    `SELECT COLUMN_TYPE AS type FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'accounts' AND COLUMN_NAME = 'role'`,
    [env.DB_NAME]
  );
  if (row && !row.type.includes('school_admin')) {
    await dbPool.query(`ALTER TABLE accounts MODIFY COLUMN role ENUM('super_admin','school_admin','teacher') NOT NULL DEFAULT 'teacher'`);
    logger.log('Migrasi: role "school_admin" ditambahkan ke enum accounts.role');
  }
}

async function ensureMustChangePasswordMigration({
  dbPool = pool,
  env = runtimeEnv,
  logger = console,
} = {}) {
  const [columns] = await dbPool.query(
    `SELECT IS_NULLABLE AS is_nullable, COLUMN_DEFAULT AS column_default
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'accounts'
       AND COLUMN_NAME = 'must_change_password'`,
    [env.DB_NAME]
  );

  let column = columns[0];
  if (!column) {
    // NULL menjadi penanda durable untuk baris yang berasal dari deployment
    // lama. Jika startup terputus, retry dapat melanjutkan tanpa rotasi ulang.
    await dbPool.query(
      'ALTER TABLE accounts ADD COLUMN must_change_password BOOLEAN NULL DEFAULT NULL'
    );
    logger.log('Migrasi: kolom "must_change_password" ditambahkan ke tabel "accounts"');
    column = { is_nullable: 'YES', column_default: null };
  }

  if (String(column.is_nullable).toUpperCase() !== 'YES') return;

  const [[legacyAdmin]] = await dbPool.query(
    `SELECT id FROM accounts
     WHERE username = ? AND role = ? AND must_change_password IS NULL
     LIMIT 1`,
    ['admin', 'super_admin']
  );

  if (legacyAdmin) {
    const bootstrapPassword = env.BOOTSTRAP_ADMIN_PASSWORD;
    if (typeof bootstrapPassword !== 'string' || bootstrapPassword.length === 0) {
      throw new Error(
        'Konfigurasi BOOTSTRAP_ADMIN_PASSWORD wajib diisi untuk memigrasikan admin legacy'
      );
    }

    const hash = await bcrypt.hash(bootstrapPassword, 10);
    const [result] = await dbPool.query(
      `UPDATE accounts
       SET password_hash = ?, must_change_password = TRUE
       WHERE id = ? AND must_change_password IS NULL`,
      [hash, legacyAdmin.id]
    );
    if (result.affectedRows > 0) {
      logger.log('Password akun admin legacy dirotasi; ganti password setelah login');
    }
  }

  await dbPool.query(
    `UPDATE accounts SET must_change_password = FALSE
     WHERE must_change_password IS NULL
       AND NOT (username = 'admin' AND role = 'super_admin')`
  );

  const [[{ cnt }]] = await dbPool.query(
    'SELECT COUNT(*) AS cnt FROM accounts WHERE must_change_password IS NULL'
  );
  if (Number(cnt) !== 0) {
    throw new Error('Migrasi must_change_password belum dapat diselesaikan dengan aman');
  }

  await dbPool.query(
    `ALTER TABLE accounts MODIFY COLUMN
     must_change_password BOOLEAN NOT NULL DEFAULT FALSE`
  );
  logger.log('Migrasi: kolom "must_change_password" difinalisasi');
}

async function initDb({
  dbPool = pool,
  env = runtimeEnv,
  logger = console,
} = {}) {
  const schema = fs.readFileSync(runtimePaths.schemaFile, 'utf8');
  await dbPool.query(schema);

  const migrationContext = { dbPool, env, logger };
  await ensureColumn('sessions', 'student_id', 'student_id INT NULL REFERENCES students(id)', migrationContext);
  await ensureColumn('sessions', 'class_id', 'class_id INT NULL REFERENCES classes(id)', migrationContext);
  await ensureColumn('sessions', 'write_token_hash', 'write_token_hash VARCHAR(64) NULL', migrationContext);
  await ensureColumn('accounts', 'auth_version', 'auth_version INT UNSIGNED NOT NULL DEFAULT 0', migrationContext);
  await ensureColumn('students', 'auth_version', 'auth_version INT UNSIGNED NOT NULL DEFAULT 0', migrationContext);
  await ensureAccountsRoleEnum(migrationContext);
  await ensureMustChangePasswordMigration(migrationContext);

  // Bootstrap hanya berjalan pada database kosong. Secret wajib disediakan
  // operator dan tidak pernah ditulis ke log atau disimpan sebagai plaintext.
  const [[{ cnt }]] = await dbPool.query('SELECT COUNT(*) AS cnt FROM accounts');
  if (cnt === 0) {
    const bootstrapPassword = env.BOOTSTRAP_ADMIN_PASSWORD;
    if (typeof bootstrapPassword !== 'string' || bootstrapPassword.length === 0) {
      throw new Error(
        'Konfigurasi BOOTSTRAP_ADMIN_PASSWORD wajib diisi untuk membuat admin pada database kosong'
      );
    }

    const hash = await bcrypt.hash(bootstrapPassword, 10);
    await dbPool.query(
      `INSERT INTO accounts
       (username, password_hash, role, school_id, must_change_password)
       VALUES (?, ?, ?, NULL, ?)`,
      ['admin', hash, 'super_admin', 1]
    );
    logger.log('Akun super_admin bootstrap dibuat; ganti password setelah login pertama');
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

app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", 'data:'],
      formAction: ["'self'"],
      frameAncestors: ["'self'"],
      frameSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'blob:', 'https://cdn.aframe.io'],
      mediaSrc: ["'self'", 'blob:'],
      objectSrc: ["'none'"],
      scriptSrc: [
        "'self'",
        "'unsafe-inline'",
        'https://aframe.io',
        'https://cdn.jsdelivr.net',
      ],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      workerSrc: ["'self'", 'blob:'],
    },
  },
  crossOriginEmbedderPolicy: false,
  strictTransportSecurity: runtimeEnv.NODE_ENV === 'production' ? undefined : false,
}));
app.use(cors());
app.use(express.json());

// ── Auth helpers ─────────────────────────────────────
const AUTH_COOKIE_NAME = 'vgn_auth';
const AUTH_COOKIE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function authCookieOptions({ includeMaxAge = true } = {}) {
  return {
    httpOnly: true,
    secure: runtimeEnv.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/api',
    ...(includeMaxAge ? { maxAge: AUTH_COOKIE_MAX_AGE_MS } : {}),
  };
}

const authRepository = createAuthRepository(pool);
const authService = createAuthService({
  repository: authRepository,
  passwords: {
    compare: bcrypt.compare,
    hash: bcrypt.hash,
  },
  tokens: {
    sign: (claims, expiresIn) => jwt.sign(claims, JWT_SECRET, { expiresIn }),
    verify: token => jwt.verify(token, JWT_SECRET),
  },
});

const { readAuthToken, requireAuth } = createAuthentication({
  cookieName: AUTH_COOKIE_NAME,
  verifyToken: token => authService.verifyToken(token),
});

const schoolsService = createSchoolsService(createSchoolsRepository(pool));
const schoolsRouter = createSchoolsRouter({ service: schoolsService, requireAuth });
const accountsService = createAccountsService(
  createAccountsRepository(pool),
  { hash: bcrypt.hash },
);
const accountsRouter = createAccountsRouter({ service: accountsService, requireAuth });
const classesService = createClassesService(createClassesRepository(pool));
const studentsService = createStudentsService(
  createStudentsRepository(pool),
  classesService,
  { hash: bcrypt.hash },
  { generate: () => String(crypto.randomInt(100000, 1000000)) },
);
const classesRouter = createClassesRouter({
  service: classesService,
  studentsService,
  requireAuth,
});
const studentsRouter = createStudentsRouter({
  service: studentsService,
  requireAuth,
  verifyToken: token => authService.verifyToken(token),
});

// ── Rate limit endpoint publik (tulis data siswa) ─────
const publicWriteLimiter = createPublicWriteLimiter();
const staffLoginLimiter = createStaffLoginLimiter();

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

// ── VR HTML template generator ────────────────────────
function generateVrPage(scene) {
  const sceneName = escapeGeneratedHtml(scene.name);
  const sceneNameUpper = escapeGeneratedHtml(scene.name.toUpperCase());
  const sceneLocation = escapeGeneratedHtml(scene.location);
  const sceneEra = escapeGeneratedHtml(scene.era);
  const skyColor = escapeGeneratedHtml(scene.sky_color || '#1a2744');
  const groundColor = escapeGeneratedHtml(scene.ground_color || '#2d4a2a');
  const cursorColor = escapeGeneratedHtml(scene.cursor_color || '#00e5ff');
  const labelColor = escapeGeneratedHtml(scene.label_color || '#00e5ff');
  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="#0F172A">
  <title>VR-GeoNusa — ${sceneName}</title>
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
  <p class="tagline">${sceneName} — ${sceneLocation}</p>
  <div class="scene-list">
    <div class="scene-card" onclick="window.location.href='../vr/tour-borobudur.html'">
      <div class="sc-name">Candi Borobudur</div><div class="sc-loc">Magelang, Jawa Tengah</div>
    </div>
    <div class="scene-card active">
      <div class="sc-name">${sceneName}</div><div class="sc-loc">${sceneLocation}</div>
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
    <div class="hud-name" id="hud-name">${sceneName}</div>
    <div class="hud-loc" id="hud-loc">${sceneLocation}</div>
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
  <button id="quiz-trigger-btn" onclick="openQuiz()"> Uji Pemahaman</button>
</div>
<div id="quiz-overlay">
  <button class="close" onclick="closeQuiz()" aria-label="Tutup">×</button>
  <div class="panel-label">Uji Pemahaman</div>
  <div id="quiz-question" class="quiz-question">—</div>
  <div id="quiz-options" class="quiz-options"></div>
  <div id="quiz-feedback" class="quiz-feedback"></div>
</div>
<button id="scene-btn" onclick="window.location.href='/'">← Portal</button>
<button id="student-results-toggle" onclick="toggleStudentResults()"> Hasil Saya</button>
<div id="student-results-panel"></div>
<a-scene id="vrscene"
  vr-mode-ui="enabled: true"
  renderer="colorManagement:true; sortObjects:true; physicallyCorrectLights:true"
  loading-screen="enabled:false"
  style="display:none">
  <a-assets timeout="10000"></a-assets>
  <a-sky color="${skyColor}"></a-sky>
  <a-entity light="type:ambient; color:#8899aa; intensity:0.45"></a-entity>
  <a-entity light="type:directional; color:#ffeedd; intensity:0.85" position="2 4 2"></a-entity>
  <a-plane position="0 0 0" rotation="-90 0 0" width="80" height="80" color="${groundColor}" roughness="1" data-ground></a-plane>
  <a-entity id="scene-label-wrap" position="0 5 -8">
    <a-text id="scene-label-main" value="${sceneNameUpper}" align="center" color="${labelColor}" width="10" opacity="0.55"></a-text>
    <a-text id="scene-label-sub"  value="${sceneEra}" align="center" color="#ffffff" width="6" position="0 -0.45 0" opacity="0.25"></a-text>
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
<script src="../js/html-sanitize.js"></script>
<script src="../js/app.js"></script>
<script>
currentScene = ${serializeInlineScriptValue(scene.scene_id)};
// Scene buatan admin tidak ada di SCENES statis bawaan app.js (cuma
// berisi 'prambanan') — daftarkan di sini supaya loadScene() di app.js
// tidak diam-diam berhenti dan gagal menampilkan scene-nya.
SCENES[currentScene] = {
  name: ${serializeInlineScriptValue(scene.name)},
  location: ${serializeInlineScriptValue(scene.location || '')},
  era: ${serializeInlineScriptValue(scene.era || '')},
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

const authRouter = createAuthRouter({
  service: authService,
  readAuthToken,
  staffLoginLimiter,
  publicWriteLimiter,
  cookieName: AUTH_COOKIE_NAME,
  cookieOptions: authCookieOptions,
});
app.use('/api/auth', authRouter);

// POST /api/auth/logout
app.post('/api/auth/logout', (req, res) => {
  res.clearCookie(AUTH_COOKIE_NAME, authCookieOptions({ includeMaxAge: false }));
  res.json({ success: true, message: 'Logout berhasil' });
});

// ══════════════════════════════════════════════════════
// REST API — SEKOLAH & AKUN GURU (super_admin only kecuali GET publik)
// ══════════════════════════════════════════════════════

app.use('/api/schools', schoolsRouter);
app.use('/api/accounts', accountsRouter);

// ══════════════════════════════════════════════════════
// REST API — KELAS & SISWA (login siswa sungguhan)
// Guru mengelola kelasnya sendiri; super_admin bisa semua kelas.
// Password siswa dibuat guru (bukan self-registration) — cocok untuk pilot
// dengan peserta yang sudah diketahui, bukan pendaftaran publik terbuka.
// ══════════════════════════════════════════════════════

app.use('/api/classes', classesRouter);
app.use('/api/students', studentsRouter);

// ══════════════════════════════════════════════════════
// REST API — SCENES (CRUD)
// ══════════════════════════════════════════════════════

const scenesRepository = createScenesRepository({
  dataDir: DATA_DIR,
  publicDataDir: path.join(PUBLIC_DIR, 'data'),
  vrDir: VR_DIR,
});
const scenesService = createScenesService(
  scenesRepository,
  { render: scene => generateVrPage(scene) },
);
const objectsService = createObjectsService(createObjectsRepository(scenesRepository));
const superAdminOnly = requireRole('super_admin');
const scenesRouter = createScenesRouter({
  service: scenesService,
  requireAuth,
  requireSuperAdmin: superAdminOnly,
});
const objectsRouter = createObjectsRouter({
  service: objectsService,
  requireAuth,
  requireSuperAdmin: superAdminOnly,
});

app.use('/api/scenes', scenesRouter);
app.use('/api/scenes', objectsRouter);

// ══════════════════════════════════════════════════════
// REST API — TUR 360° DAN DATASET ML
// ══════════════════════════════════════════════════════

function readQuizQuestion(questionId) {
  const quiz = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'quiz.json'), 'utf8'));
  return (quiz.questions || []).find(question => question.id === questionId) || null;
}
const toursRepository = createToursRepository({
  dataDir: DATA_DIR,
  publicDataDir: path.join(PUBLIC_DIR, 'data'),
});
const toursService = createToursService(toursRepository);
const toursRouter = createToursRouter({
  service: toursService,
  requireAuth,
  requireSuperAdmin: superAdminOnly,
});
const datasetService = createDatasetService(
  createDatasetRepository({ datasetDir: DATASET_DIR }),
  toursRepository,
);
const datasetRouter = createDatasetRouter({
  service: datasetService,
  requireAuth,
  requireSuperAdmin: superAdminOnly,
});

app.use('/api', toursRouter);
app.use('/api/dataset', datasetRouter);

// ══════════════════════════════════════════════════════
// REST API — ML SERVER-SIDE (inferensi resmi, bukan hasil browser klien)
// ══════════════════════════════════════════════════════

// POST /api/ml/predict/:tourId/:nodeId — server crop foto panorama dari
// disk sendiri (tidak perlu upload gambar) lalu jalankan model TF.js
// (@tensorflow/tfjs-node) untuk prediksi kelas geometri.
app.post('/api/ml/predict/:tourId/:nodeId', publicWriteLimiter, async (req, res) => {
  const tourId = assertFileIdentifier(req.params.tourId, 'tour_id');
  const nodeId = assertFileIdentifier(req.params.nodeId, 'node_id');
  if (!mlProvider) {
    initializeMlProvider().catch(error => logMlInitializationError(error));
    return res.status(503).json({ success: false, message: 'Layanan prediksi ML belum siap' });
  }

  try {
    const result = await mlProvider.predictNode(tourId, nodeId);
    res.json({ success: true, data: result });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ══════════════════════════════════════════════════════
// REST API — SESI SISWA, INTERAKSI, PREDIKSI, KUIS
// (log aktivitas siswa selama eksplorasi — dasar laporan guru)
// ══════════════════════════════════════════════════════

function hashSessionToken(token) {
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
}

function equalSessionTokenHashes(suppliedHash, storedHash) {
  const supplied = Buffer.from(suppliedHash, 'hex');
  const stored = Buffer.from(storedHash, 'hex');
  return supplied.length === stored.length && crypto.timingSafeEqual(supplied, stored);
}

const sessionsService = createSessionsService(
  createSessionsRepository(pool),
  {
    generate: () => crypto.randomBytes(32).toString('base64url'),
    hash: hashSessionToken,
    equalHash: equalSessionTokenHashes,
  },
);
const sessionsRouter = createSessionsRouter({
  service: sessionsService,
  publicWriteLimiter,
  verifyToken: token => authService.verifyToken(token),
});
const learningEventsService = createLearningEventsService(
  createLearningEventsRepository(pool),
  sessionsService,
  {
    resolve: reference => upsertObject(reference),
  },
  {
    find: questionId => readQuizQuestion(questionId),
  },
);
const learningEventsRouter = createLearningEventsRouter({
  service: learningEventsService,
  publicWriteLimiter,
  verifyToken: token => authService.verifyToken(token),
});

app.use('/api/sessions', sessionsRouter);
app.use('/api', learningEventsRouter);

const reportsService = createReportsService(createReportsRepository(pool, {
  quizFile: path.join(DATA_DIR, 'quiz.json'),
}));
const reportsRouter = createReportsRouter({
  service: reportsService,
  requireAuth,
  requireStaffReportAccess: requireAnyRole('super_admin', 'school_admin', 'teacher'),
});

app.use('/api/reports', reportsRouter);

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
  assertFileIdentifier(member.id, 'team_id');
  if (team.find(m => m.id === member.id))
    return res.status(409).json({ success: false, message: `ID "${member.id}" sudah ada` });
  member.order = member.order ?? (team.length + 1);
  team.push(member);
  writeTeam(team);
  res.status(201).json({ success: true, data: member });
});

// PUT /api/team/:id — update anggota
app.put('/api/team/:id', requireAuth, requireRole('super_admin'), (req, res) => {
  assertFileIdentifier(req.params.id, 'team_id');
  const team = readTeam();
  const idx = team.findIndex(m => m.id === req.params.id);
  if (idx < 0) return res.status(404).json({ success: false, message: 'Anggota tidak ditemukan' });
  team[idx] = { ...team[idx], ...req.body, id: req.params.id };
  writeTeam(team);
  res.json({ success: true, data: team[idx] });
});

// DELETE /api/team/:id
app.delete('/api/team/:id', requireAuth, requireRole('super_admin'), (req, res) => {
  assertFileIdentifier(req.params.id, 'team_id');
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
  const teamId = assertFileIdentifier(req.params.id, 'team_id');
  const team = readTeam();
  const member = team.find(m => m.id === teamId);
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
      const filename = `${teamId}.${ext}`;
      const teamImgDir = path.join(PUBLIC_DIR, 'assets', 'images', 'team');
      if (!fs.existsSync(teamImgDir)) fs.mkdirSync(teamImgDir, { recursive: true });
      fs.writeFileSync(resolveWithin(teamImgDir, filename), buf);

      const photoPath = `/assets/images/team/${filename}`;
      const idx = team.findIndex(m => m.id === teamId);
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
  const [[{ ok }]] = await req.app.locals.dbPool.query('SELECT 1 AS ok');
  res.json({ success: true, message: 'VR-GeoNusa server running', version: '2.0.0', db: ok === 1 ? 'connected' : 'error',
    timestamp: new Date().toISOString(),
    scenes: fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json')).map(f => f.replace('.json','')),
  });
});

// ── Fallback ─────────────────────────────────────────
app.get('*', (req, res) => {
  let filePath;
  try {
    filePath = resolveWithin(PUBLIC_DIR, req.path.replace(/^[/\\]+/, ''));
  } catch (error) {
    if (!(error instanceof InvalidFilePathError)) throw error;
    return res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
  }
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) return res.sendFile(filePath);
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

// Centralized error handler harus menjadi middleware terakhir. Response tidak
// membocorkan detail error internal, sementara logger tetap menerima detailnya.
app.use(errorHandler);

// ── Start ─────────────────────────────────────────────
async function startServer({
  port = PORT,
  initializeDatabase = initDb,
  initializeMl = initializeMlProvider,
  logger = console,
} = {}) {
  return startHttpServer({
    app,
    port,
    initializeDatabase,
    initializeMl,
    logger,
    databaseLabel: `${runtimeEnv.DB_NAME}@${runtimeEnv.DB_HOST}`,
    onMlError: logMlInitializationError,
  });
}

if (require.main === module) {
  startServer().catch(error => {
    console.error('Gagal konek/inisialisasi database:', error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  app,
  ensureMustChangePasswordMigration,
  initDb,
  staffLoginLimiter,
  startServer,
};
