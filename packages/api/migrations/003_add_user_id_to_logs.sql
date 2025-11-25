-- Add user_id column to weight_logs and injection_logs
-- This links log entries to the authenticated user

-- Add user_id to weight_logs (nullable initially for migration)
ALTER TABLE weight_logs
ADD COLUMN user_id TEXT;

-- Add user_id to injection_logs (nullable initially for migration)
ALTER TABLE injection_logs
ADD COLUMN user_id TEXT;

-- Create indexes for efficient user-based queries
CREATE INDEX idx_weight_logs_user_id ON weight_logs(user_id);
CREATE INDEX idx_injection_logs_user_id ON injection_logs(user_id);
