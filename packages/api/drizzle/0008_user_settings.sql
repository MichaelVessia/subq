-- User settings table
CREATE TABLE IF NOT EXISTS `user_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL UNIQUE,
	`weight_unit` text DEFAULT 'lbs' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_user_settings_user_id` ON `user_settings` (`user_id`);
