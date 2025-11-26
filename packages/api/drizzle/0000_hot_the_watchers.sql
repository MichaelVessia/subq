CREATE TABLE `injection_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`datetime` text NOT NULL,
	`drug` text NOT NULL,
	`source` text,
	`dosage` text NOT NULL,
	`injection_site` text,
	`notes` text,
	`user_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_injection_logs_datetime` ON `injection_logs` (`datetime`);--> statement-breakpoint
CREATE INDEX `idx_injection_logs_drug` ON `injection_logs` (`drug`);--> statement-breakpoint
CREATE INDEX `idx_injection_logs_user_id` ON `injection_logs` (`user_id`);--> statement-breakpoint
CREATE TABLE `_migrations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`applied_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `_migrations_name_unique` ON `_migrations` (`name`);--> statement-breakpoint
CREATE TABLE `weight_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`datetime` text NOT NULL,
	`weight` real NOT NULL,
	`unit` text NOT NULL,
	`notes` text,
	`user_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_weight_logs_datetime` ON `weight_logs` (`datetime`);--> statement-breakpoint
CREATE INDEX `idx_weight_logs_user_id` ON `weight_logs` (`user_id`);