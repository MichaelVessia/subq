-- Add schedule_id column to injection_logs for linking injections to schedules
ALTER TABLE injection_logs ADD COLUMN schedule_id TEXT REFERENCES injection_schedules(id) ON DELETE SET NULL;

-- Index for faster lookups by schedule
CREATE INDEX idx_injection_logs_schedule_id ON injection_logs(schedule_id);
