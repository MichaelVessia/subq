-- Convert all kg weights to lbs (1 kg = 2.20462 lbs)
UPDATE weight_logs SET weight = weight * 2.20462 WHERE unit = 'kg';
--> statement-breakpoint
-- Recreate weight_logs table without unit column
CREATE TABLE `weight_logs_new` (
	`id` text PRIMARY KEY NOT NULL,
	`datetime` text NOT NULL,
	`weight` real NOT NULL,
	`notes` text,
	`user_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
INSERT INTO weight_logs_new (id, datetime, weight, notes, user_id, created_at, updated_at)
SELECT id, datetime, weight, notes, user_id, created_at, updated_at FROM weight_logs;
--> statement-breakpoint
DROP TABLE weight_logs;
--> statement-breakpoint
ALTER TABLE weight_logs_new RENAME TO weight_logs;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_weight_logs_datetime` ON `weight_logs` (`datetime`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_weight_logs_user_id` ON `weight_logs` (`user_id`);
