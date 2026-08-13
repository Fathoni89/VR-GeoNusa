-- VR-GeoNusa — skema database (SQLite)
--
-- Dipilih SQLite (bukan MySQL) untuk MVP karena hosting Rumahweb Unlimited S
-- tidak menyediakan akses Node.js/SSH ke MySQL server terpisah — SQLite cukup
-- berupa satu file (data/geonusa.db) yang dibaca langsung oleh server.js
-- via driver better-sqlite3. Kolom & relasi dirancang agar migrasi ke
-- MySQL/MariaDB (paket Medium ke atas) tinggal ganti driver, bukan ganti skema.

CREATE TABLE IF NOT EXISTS users (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  role       TEXT,               -- 'siswa' | 'guru' | 'peneliti'
  school     TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id          INTEGER REFERENCES users(id),
  scene_name       TEXT NOT NULL,   -- 'borobudur' | 'prambanan'
  started_at       TEXT NOT NULL DEFAULT (datetime('now')),
  ended_at         TEXT,
  duration_seconds INTEGER,
  device_type      TEXT             -- 'desktop' | 'mobile' | 'vr-headset'
);

CREATE TABLE IF NOT EXISTS objects (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  object_code      TEXT NOT NULL UNIQUE,  -- ex: 'obj-stupa' (cocok dengan id di data/*.json)
  object_name      TEXT NOT NULL,
  geometry_label   TEXT NOT NULL,         -- cocok dengan class_id di data/geometry-labels.json
  description      TEXT,
  formula          TEXT,
  cultural_context TEXT
);

CREATE TABLE IF NOT EXISTS predictions (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id       INTEGER REFERENCES sessions(id),
  object_id        INTEGER REFERENCES objects(id),
  predicted_label  TEXT NOT NULL,
  confidence_score REAL NOT NULL,
  is_correct       INTEGER,   -- 0/1, null jika belum diverifikasi
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS interactions (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id       INTEGER REFERENCES sessions(id),
  object_id        INTEGER REFERENCES objects(id),
  interaction_type TEXT NOT NULL,  -- 'gaze' | 'click' | 'info_open'
  gaze_duration    REAL,           -- detik
  timestamp        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS quiz_results (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id     INTEGER REFERENCES sessions(id),
  question_id    TEXT NOT NULL,   -- cocok dengan id di data/quiz.json
  answer         TEXT NOT NULL,
  is_correct     INTEGER NOT NULL,
  response_time  REAL,            -- detik
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_predictions_session   ON predictions(session_id);
CREATE INDEX IF NOT EXISTS idx_interactions_session   ON interactions(session_id);
CREATE INDEX IF NOT EXISTS idx_quiz_results_session   ON quiz_results(session_id);
