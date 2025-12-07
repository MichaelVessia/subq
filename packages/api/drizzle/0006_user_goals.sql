-- User goals table
CREATE TABLE IF NOT EXISTS `user_goals` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`goal_weight` real NOT NULL,
	`starting_weight` real NOT NULL,
	`starting_date` text NOT NULL,
	`target_date` text,
	`notes` text,
	`is_active` integer DEFAULT 1 NOT NULL,
	`completed_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_user_goals_user_id` ON `user_goals` (`user_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_user_goals_is_active` ON `user_goals` (`is_active`);
--> statement-breakpoint
-- Milestones table
CREATE TABLE IF NOT EXISTS `milestones` (
	`id` text PRIMARY KEY NOT NULL,
	`goal_id` text NOT NULL,
	`user_id` text NOT NULL,
	`type` text NOT NULL,
	`value` real NOT NULL,
	`achieved_at` text,
	`weight_at_achievement` real,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`goal_id`) REFERENCES `user_goals`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_milestones_goal_id` ON `milestones` (`goal_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_milestones_user_id` ON `milestones` (`user_id`);
