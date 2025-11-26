CREATE TABLE `glp1_inventory` (
	`id` text PRIMARY KEY NOT NULL,
	`drug` text NOT NULL,
	`source` text NOT NULL,
	`form` text NOT NULL,
	`total_amount` text NOT NULL,
	`status` text NOT NULL,
	`beyond_use_date` text,
	`user_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_glp1_inventory_user_id` ON `glp1_inventory` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_glp1_inventory_status` ON `glp1_inventory` (`status`);--> statement-breakpoint
CREATE INDEX `idx_glp1_inventory_drug` ON `glp1_inventory` (`drug`);