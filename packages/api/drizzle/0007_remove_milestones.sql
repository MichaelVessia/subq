-- Remove milestones table (no longer needed)
DROP INDEX IF EXISTS `idx_milestones_goal_id`;
--> statement-breakpoint
DROP INDEX IF EXISTS `idx_milestones_user_id`;
--> statement-breakpoint
DROP TABLE IF EXISTS `milestones`;
