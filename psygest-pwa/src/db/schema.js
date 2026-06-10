const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_DIR = path.join(__dirname, '../../data');
const DB_PATH = path.join(DB_DIR, 'psygest_pwa.db');

if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS codes (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    code          TEXT    NOT NULL UNIQUE,
    questionnaire TEXT    NOT NULL,
    questionnaires TEXT,
    created_at    INTEGER NOT NULL DEFAULT (unixepoch()),
    expires_at    INTEGER NOT NULL,
    used          INTEGER NOT NULL DEFAULT 0,
    used_at       INTEGER
  );

  CREATE TABLE IF NOT EXISTS responses (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    code          TEXT    NOT NULL,
    questionnaire TEXT    NOT NULL,
    answers       TEXT    NOT NULL,
    score         INTEGER NOT NULL,
    severity      TEXT    NOT NULL,
    submitted_at  INTEGER NOT NULL DEFAULT (unixepoch()),
    exported      INTEGER NOT NULL DEFAULT 0,
    consentement_recueilli INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS consentements (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    code              TEXT NOT NULL UNIQUE,
    date_consentement TEXT NOT NULL,
    created_at        INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE INDEX IF NOT EXISTS idx_codes_code ON codes(code);
  CREATE INDEX IF NOT EXISTS idx_responses_exported ON responses(exported);
  CREATE INDEX IF NOT EXISTS idx_responses_code ON responses(code);
`);

// Migrations pour bases existantes
const cols = db.pragma('table_info(codes)').map(c => c.name);
if (!cols.includes('questionnaires')) {
  db.exec('ALTER TABLE codes ADD COLUMN questionnaires TEXT');
}

const rcols = db.pragma('table_info(responses)').map(c => c.name);
if (!rcols.includes('consentement_recueilli')) {
  db.exec('ALTER TABLE responses ADD COLUMN consentement_recueilli INTEGER NOT NULL DEFAULT 0');
}

module.exports = db;
