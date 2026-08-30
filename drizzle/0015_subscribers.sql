-- The fan email list. Captured on our own pages so the addresses are ours
-- regardless of what the pre-save handoff runs on.
CREATE TABLE `subscribers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text NOT NULL,
	`name` text,
	`source` text,
	`country` text,
	`consent_at` integer NOT NULL,
	`token` text NOT NULL,
	`unsubscribed_at` integer,
	`created_at` integer
);--> statement-breakpoint
CREATE UNIQUE INDEX `subscribers_email_unique` ON `subscribers` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `subscribers_token_unique` ON `subscribers` (`token`);--> statement-breakpoint
CREATE INDEX `subscribers_created_at_idx` ON `subscribers` (`created_at`);--> statement-breakpoint
ALTER TABLE `settings` ADD `subscribers_enabled` integer DEFAULT false;
