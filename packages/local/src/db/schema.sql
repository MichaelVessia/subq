-- Local SQLite schema for @subq/local
-- Mirrors server synced tables plus local-only sync tables

-- ============================================
-- Synced Tables (mirror server schema)
-- ============================================

-- Weight logs
CREATE TABLE IF NOT EXISTS weight_logs (
  id TEXT PRIMARY KEY,
  datetime TEXT NOT NULL,
  weight REAL NOT NULL,
  notes TEXT,
  user_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

-- Injection schedules (must come before injection_logs due to FK)
CREATE TABLE IF NOT EXISTS injection_schedules (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  drug TEXT NOT NULL,
  source TEXT,
  frequency TEXT NOT NULL,
  start_date TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  user_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

-- Schedule phases
CREATE TABLE IF NOT EXISTS schedule_phases (
  id TEXT PRIMARY KEY,
  schedule_id TEXT NOT NULL REFERENCES injection_schedules(id) ON DELETE CASCADE,
  "order" INTEGER NOT NULL,
  duration_days INTEGER,
  dosage TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

-- Injection logs
CREATE TABLE IF NOT EXISTS injection_logs (
  id TEXT PRIMARY KEY,
  datetime TEXT NOT NULL,
  drug TEXT NOT NULL,
  source TEXT,
  dosage TEXT NOT NULL,
  injection_site TEXT,
  notes TEXT,
  schedule_id TEXT REFERENCES injection_schedules(id) ON DELETE SET NULL,
  user_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

-- GLP-1 Inventory
CREATE TABLE IF NOT EXISTS glp1_inventory (
  id TEXT PRIMARY KEY,
  drug TEXT NOT NULL,
  source TEXT NOT NULL,
  form TEXT NOT NULL,
  total_amount TEXT NOT NULL,
  status TEXT NOT NULL,
  beyond_use_date TEXT,
  user_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

-- User goals
CREATE TABLE IF NOT EXISTS user_goals (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  goal_weight REAL NOT NULL,
  starting_weight REAL NOT NULL,
  starting_date TEXT NOT NULL,
  target_date TEXT,
  notes TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

-- User settings
CREATE TABLE IF NOT EXISTS user_settings (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  weight_unit TEXT NOT NULL DEFAULT 'lbs',
  reminders_enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

-- ============================================
-- Local-only Sync Tables
-- ============================================

-- Outbox table for pending changes to push to server
CREATE TABLE IF NOT EXISTS sync_outbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  table_name TEXT NOT NULL,
  row_id TEXT NOT NULL,
  operation TEXT NOT NULL,
  payload TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

-- Sync metadata table for cursor and other sync state
CREATE TABLE IF NOT EXISTS sync_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
