CREATE TABLE `injection_schedules` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`drug` text NOT NULL,
	`source` text,
	`frequency` text NOT NULL,
	`start_date` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`notes` text,
	`user_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `schedule_phases` (
	`id` text PRIMARY KEY NOT NULL,
	`schedule_id` text NOT NULL REFERENCES `injection_schedules`(`id`) ON DELETE CASCADE,
	`order` integer NOT NULL,
	`duration_days` integer NOT NULL,
	`dosage` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_injection_schedules_user_id` ON `injection_schedules` (`user_id`);
--> statement-breakpoint
CREATE INDEX `idx_injection_schedules_is_active` ON `injection_schedules` (`is_active`);
--> statement-breakpoint
CREATE INDEX `idx_schedule_phases_schedule_id` ON `schedule_phases` (`schedule_id`);
