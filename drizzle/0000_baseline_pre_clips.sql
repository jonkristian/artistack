CREATE TABLE `blocks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`page_id` integer,
	`type` text NOT NULL,
	`label` text,
	`config` text,
	`position` integer DEFAULT 0,
	`visible` integer DEFAULT true,
	`collapsed` integer DEFAULT false,
	`created_at` integer
);
--> statement-breakpoint
CREATE INDEX `blocks_page_id_idx` ON `blocks` (`page_id`);--> statement-breakpoint
CREATE TABLE `integrations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`provider` text NOT NULL,
	`enabled` integer DEFAULT false,
	`config` text,
	`last_sync` integer,
	`cached_data` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `integrations_provider_unique` ON `integrations` (`provider`);--> statement-breakpoint
CREATE TABLE `link_clicks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`link_id` integer NOT NULL,
	`referrer` text,
	`country` text,
	`created_at` integer
);
--> statement-breakpoint
CREATE INDEX `link_clicks_link_id_idx` ON `link_clicks` (`link_id`);--> statement-breakpoint
CREATE INDEX `link_clicks_created_at_idx` ON `link_clicks` (`created_at`);--> statement-breakpoint
CREATE TABLE `links` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`block_id` integer NOT NULL,
	`category` text NOT NULL,
	`platform` text NOT NULL,
	`url` text NOT NULL,
	`label` text,
	`thumbnail_url` text,
	`embed_data` text,
	`position` integer DEFAULT 0,
	`visible` integer DEFAULT true
);
--> statement-breakpoint
CREATE INDEX `links_block_id_idx` ON `links` (`block_id`);--> statement-breakpoint
CREATE TABLE `media` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`filename` text NOT NULL,
	`url` text NOT NULL,
	`original_url` text,
	`thumbnail_url` text,
	`mime_type` text NOT NULL,
	`width` integer,
	`height` integer,
	`size` integer,
	`original_size` integer,
	`alt` text,
	`created_at` integer
);
--> statement-breakpoint
CREATE TABLE `page_views` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`path` text NOT NULL,
	`referrer` text,
	`country` text,
	`user_agent` text,
	`created_at` integer
);
--> statement-breakpoint
CREATE INDEX `page_views_created_at_idx` ON `page_views` (`created_at`);--> statement-breakpoint
CREATE INDEX `page_views_path_idx` ON `page_views` (`path`);--> statement-breakpoint
CREATE TABLE `pages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`type` text DEFAULT 'custom' NOT NULL,
	`description` text,
	`published` integer DEFAULT true,
	`position` integer DEFAULT 0,
	`created_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pages_slug_unique` ON `pages` (`slug`);--> statement-breakpoint
CREATE TABLE `products` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`price` integer,
	`currency` text DEFAULT 'NOK',
	`media_id` integer,
	`external_url` text,
	`category` text,
	`visible` integer DEFAULT true,
	`featured` integer DEFAULT false,
	`position` integer DEFAULT 0,
	`created_at` integer
);
--> statement-breakpoint
CREATE TABLE `profile` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`bio` text,
	`email` text
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`site_title` text,
	`setup_completed` integer DEFAULT false,
	`press_kit_enabled` integer DEFAULT false,
	`press_kit_media_ids` text DEFAULT '[]',
	`layout` text DEFAULT 'default',
	`locale` text DEFAULT 'nb-NO',
	`color_bg` text DEFAULT '#0c0a14',
	`color_card` text DEFAULT '#14101f',
	`color_accent` text DEFAULT '#8b5cf6',
	`color_text` text DEFAULT '#f4f4f5',
	`color_text_muted` text DEFAULT '#a1a1aa',
	`color_icon` text DEFAULT '#a1a1aa',
	`show_share_button` integer DEFAULT true,
	`show_press_kit` integer DEFAULT false,
	`favicon_url` text,
	`favicon_generated` integer DEFAULT false,
	`google_places_api_key` text,
	`smtp_host` text,
	`smtp_port` integer DEFAULT 587,
	`smtp_user` text,
	`smtp_password` text,
	`smtp_from_address` text,
	`smtp_from_name` text,
	`smtp_tls` integer DEFAULT true,
	`discord_webhook_url` text,
	`discord_enabled` integer DEFAULT false,
	`discord_schedule` text DEFAULT 'weekly',
	`discord_schedule_day` integer DEFAULT 1,
	`discord_schedule_time` text DEFAULT '09:00',
	`discord_last_sent` integer
);
--> statement-breakpoint
CREATE TABLE `tour_dates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`block_id` integer NOT NULL,
	`date` text NOT NULL,
	`time` text,
	`title` text,
	`venue` text NOT NULL,
	`lineup` text,
	`ticket_url` text,
	`event_url` text,
	`sold_out` integer DEFAULT false,
	`position` integer DEFAULT 0
);
--> statement-breakpoint
CREATE INDEX `tour_dates_block_id_idx` ON `tour_dates` (`block_id`);--> statement-breakpoint
CREATE INDEX `tour_dates_date_idx` ON `tour_dates` (`date`);--> statement-breakpoint
CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `account_userId_idx` ON `account` (`user_id`);--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE INDEX `session_userId_idx` ON `session` (`user_id`);--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`role` text DEFAULT 'editor' NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `verification_identifier_idx` ON `verification` (`identifier`);