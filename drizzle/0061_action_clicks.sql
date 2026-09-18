-- Clicks on pre-save and ticket buttons, which aren't links in the links table
-- and so had nowhere to be counted. Same shape and ninety-day rollup as
-- link_clicks, with the thing clicked named by action and subject instead.

CREATE TABLE `action_clicks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`action` text NOT NULL,
	`subject_id` integer NOT NULL,
	`referrer` text,
	`country` text,
	`device` text,
	`created_at` integer
);--> statement-breakpoint

CREATE INDEX `action_clicks_subject_idx` ON `action_clicks` (`action`, `subject_id`);--> statement-breakpoint
CREATE INDEX `action_clicks_created_at_idx` ON `action_clicks` (`created_at`);--> statement-breakpoint

CREATE TABLE `action_click_daily` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`action` text NOT NULL,
	`subject_id` integer NOT NULL,
	`referrer` text,
	`country` text,
	`device` text,
	`clicks` integer NOT NULL
);--> statement-breakpoint

CREATE INDEX `action_click_daily_date_idx` ON `action_click_daily` (`date`);
