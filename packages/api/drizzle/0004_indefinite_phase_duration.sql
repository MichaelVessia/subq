-- Allow NULL duration_days for indefinite/maintenance phases
-- SQLite requires table recreation to change NOT NULL constraint

-- Create new table without NOT NULL on duration_days
CREATE TABLE `schedule_phases_new` (
	`id` text PRIMARY KEY NOT NULL,
	`schedule_id` text NOT NULL REFERENCES `injection_schedules`(`id`) ON DELETE CASCADE,
	`order` integer NOT NULL,
	`duration_days` integer,
	`dosage` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `schedule_phases_new` SELECT * FROM `schedule_phases`;
--> statement-breakpoint
DROP TABLE `schedule_phases`;
--> statement-breakpoint
ALTER TABLE `schedule_phases_new` RENAME TO `schedule_phases`;
--> statement-breakpoint
CREATE INDEX `idx_schedule_phases_schedule_id` ON `schedule_phases` (`schedule_id`);
