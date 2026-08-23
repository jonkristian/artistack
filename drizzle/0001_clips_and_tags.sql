CREATE TABLE `clip_projects` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`config` text,
	`captions` text DEFAULT '[]',
	`output_media_id` integer,
	`resolved_graphic_media_id` integer,
	`status` text DEFAULT 'draft' NOT NULL,
	`preview_token` text,
	`review_note` text,
	`reviewed_at` integer,
	`queue_position` integer,
	`queue_gap_days` integer,
	`published_at` integer,
	`created_at` integer,
	`updated_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `clip_projects_preview_token_unique` ON `clip_projects` (`preview_token`);--> statement-breakpoint
CREATE TABLE `clip_sources` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` integer NOT NULL,
	`media_id` integer NOT NULL,
	`position` integer DEFAULT 0,
	`trim_start` integer,
	`trim_end` integer,
	`muted` integer DEFAULT false,
	`watermark` integer
);
--> statement-breakpoint
CREATE INDEX `clip_sources_project_id_idx` ON `clip_sources` (`project_id`);--> statement-breakpoint
CREATE TABLE `render_jobs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` integer NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`progress` integer DEFAULT 0,
	`error` text,
	`log` text,
	`media_id` integer,
	`started_at` integer,
	`finished_at` integer,
	`created_at` integer
);
--> statement-breakpoint
CREATE INDEX `render_jobs_project_id_idx` ON `render_jobs` (`project_id`);--> statement-breakpoint
CREATE INDEX `render_jobs_status_idx` ON `render_jobs` (`status`);--> statement-breakpoint
CREATE TABLE `taggings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tag_id` integer NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `taggings_unique_idx` ON `taggings` (`tag_id`,`entity_type`,`entity_id`);--> statement-breakpoint
CREATE INDEX `taggings_entity_idx` ON `taggings` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE TABLE `tags` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`created_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tags_slug_unique` ON `tags` (`slug`);--> statement-breakpoint
CREATE TABLE `upload_sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`token` text NOT NULL,
	`label` text,
	`project_id` integer,
	`expires_at` integer NOT NULL,
	`upload_count` integer DEFAULT 0 NOT NULL,
	`revoked` integer DEFAULT false,
	`last_upload_at` integer,
	`created_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `upload_sessions_token_unique` ON `upload_sessions` (`token`);--> statement-breakpoint
CREATE INDEX `upload_sessions_token_idx` ON `upload_sessions` (`token`);--> statement-breakpoint
ALTER TABLE `media` ADD `duration_ms` integer;--> statement-breakpoint
ALTER TABLE `media` ADD `role` text DEFAULT 'asset' NOT NULL;--> statement-breakpoint
ALTER TABLE `settings` ADD `clips_enabled` integer DEFAULT false;--> statement-breakpoint
ALTER TABLE `settings` ADD `publish_webhook_url` text;--> statement-breakpoint
ALTER TABLE `settings` ADD `publish_enabled` integer DEFAULT false;--> statement-breakpoint
ALTER TABLE `settings` ADD `publish_interval_days` integer DEFAULT 3;--> statement-breakpoint
ALTER TABLE `settings` ADD `publish_hour` integer DEFAULT 10;--> statement-breakpoint
ALTER TABLE `settings` ADD `publish_last_sent` integer;--> statement-breakpoint
ALTER TABLE `settings` ADD `publish_secret` text;--> statement-breakpoint
ALTER TABLE `settings` ADD `clip_graphics_media_ids` text DEFAULT '[]';--> statement-breakpoint
ALTER TABLE `settings` ADD `default_clip_graphic_media_id` integer;--> statement-breakpoint
ALTER TABLE `settings` ADD `clip_default_tag_ids` text DEFAULT '[]';--> statement-breakpoint
ALTER TABLE `settings` ADD `clip_default_description` text;