-- Add deleted_at column to all synced tables for soft delete support
ALTER TABLE weight_logs ADD COLUMN deleted_at TEXT;
ALTER TABLE injection_logs ADD COLUMN deleted_at TEXT;
ALTER TABLE glp1_inventory ADD COLUMN deleted_at TEXT;
ALTER TABLE injection_schedules ADD COLUMN deleted_at TEXT;
ALTER TABLE schedule_phases ADD COLUMN deleted_at TEXT;
ALTER TABLE user_goals ADD COLUMN deleted_at TEXT;
ALTER TABLE user_settings ADD COLUMN deleted_at TEXT;
