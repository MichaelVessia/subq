-- Add CLI session columns to session table for CLI token management
ALTER TABLE session ADD COLUMN type TEXT DEFAULT 'web';
ALTER TABLE session ADD COLUMN device_name TEXT;
ALTER TABLE session ADD COLUMN last_used_at TEXT;
