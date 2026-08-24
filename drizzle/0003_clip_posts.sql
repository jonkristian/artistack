CREATE TABLE `clip_posts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` integer NOT NULL,
	`platform` text NOT NULL,
	`status` text NOT NULL,
	`url` text,
	`error` text,
	`posted_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `clip_posts_unique_idx` ON `clip_posts` (`project_id`,`platform`);--> statement-breakpoint
CREATE INDEX `clip_posts_project_idx` ON `clip_posts` (`project_id`);