-- VR-GeoNusa — snapshot schema legacy (MySQL/MariaDB)
--
-- Jangan gunakan file ini untuk instalasi atau upgrade baru. Schema aktif ada
-- di src/db/schema.ts dan dijalankan melalui `npm run db:migrate -- --approve`.
-- File ini dipertahankan sebagai bentuk input yang didukung jalur baseline
-- legacy pada Fase 7.
--
-- Versi MySQL dari db/schema.sql (SQLite), dipakai sejak hosting pindah ke
-- Rumahweb Medium. Tabel `schools` dan `accounts` baru untuk Tahap 2
-- (multi-sekolah, login guru per sekolah) — lihat db/schema.sql untuk versi
-- SQLite lama (masih disimpan sebagai referensi/dev cepat tanpa MySQL).

CREATE TABLE IF NOT EXISTS schools (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(150) NOT NULL,
  code       VARCHAR(30) UNIQUE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS accounts (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  username      VARCHAR(100) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,  -- bcrypt hash (sudah termasuk salt)
  role          ENUM('super_admin','school_admin','teacher') NOT NULL DEFAULT 'teacher',
  school_id     INT NULL REFERENCES schools(id),  -- NULL untuk super_admin
  must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
  auth_version  INT UNSIGNED NOT NULL DEFAULT 0,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS users (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(100) NOT NULL,
  role       VARCHAR(20),               -- 'siswa' | 'guru' | 'peneliti'
  school_id  INT NULL REFERENCES schools(id),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Kelas dikelola guru (accounts.role='teacher') di sekolahnya sendiri.
CREATE TABLE IF NOT EXISTS classes (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  school_id         INT NOT NULL REFERENCES schools(id),
  teacher_account_id INT NOT NULL REFERENCES accounts(id),
  class_name        VARCHAR(100) NOT NULL,
  grade_level       VARCHAR(20),
  academic_year     VARCHAR(20),
  created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_classes_school (school_id),
  INDEX idx_classes_teacher (teacher_account_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Login siswa sungguhan (terpisah dari `accounts` yang untuk staf/guru) —
-- kredensial ringan (nomor induk + password) dibuat guru saat mendaftarkan
-- kelasnya, bukan self-registration.
CREATE TABLE IF NOT EXISTS students (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  school_id      INT NOT NULL REFERENCES schools(id),
  class_id       INT NOT NULL REFERENCES classes(id),
  name           VARCHAR(100) NOT NULL,
  student_number VARCHAR(50) NOT NULL,
  password_hash  VARCHAR(255) NOT NULL,
  auth_version   INT UNSIGNED NOT NULL DEFAULT 0,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_student_number_per_school (school_id, student_number),
  INDEX idx_students_class (class_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sessions (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  user_id          INT REFERENCES users(id),
  student_id       INT NULL REFERENCES students(id), -- diisi kalau siswa login sungguhan (bukan mode anonim/demo)
  school_id        INT NULL REFERENCES schools(id),
  class_id         INT NULL REFERENCES classes(id),
  write_token_hash VARCHAR(64) NULL,
  scene_name       VARCHAR(100) NOT NULL,
  started_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ended_at         DATETIME NULL,
  duration_seconds INT NULL,
  device_type      VARCHAR(20),
  INDEX idx_sessions_school (school_id),
  INDEX idx_sessions_class (class_id),
  INDEX idx_sessions_started (started_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS objects (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  object_code      VARCHAR(100) NOT NULL UNIQUE,
  object_name      VARCHAR(150) NOT NULL,
  geometry_label   VARCHAR(100) NOT NULL,
  description      TEXT,
  formula          VARCHAR(255),
  cultural_context TEXT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS predictions (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  session_id       INT REFERENCES sessions(id),
  object_id        INT REFERENCES objects(id),
  predicted_label  VARCHAR(100) NOT NULL,
  confidence_score FLOAT NOT NULL,
  is_correct       TINYINT(1) NULL,
  created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_predictions_session (session_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS interactions (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  session_id       INT REFERENCES sessions(id),
  object_id        INT REFERENCES objects(id),
  interaction_type VARCHAR(30) NOT NULL,
  gaze_duration    FLOAT NULL,
  timestamp        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_interactions_session (session_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS quiz_results (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  session_id     INT REFERENCES sessions(id),
  question_id    VARCHAR(100) NOT NULL,
  answer         VARCHAR(255) NOT NULL,
  is_correct     TINYINT(1) NOT NULL,
  response_time  FLOAT NULL,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_quiz_results_session (session_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
