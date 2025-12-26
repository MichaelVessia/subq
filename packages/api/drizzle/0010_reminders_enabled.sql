-- Add reminders_enabled column to user_settings
ALTER TABLE user_settings ADD COLUMN reminders_enabled INTEGER NOT NULL DEFAULT 1;
