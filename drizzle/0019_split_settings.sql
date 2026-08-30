-- One wide row becomes six focused tables.
--
-- `settings` keeps what the site is and how it looks; each feature's config
-- moves beside the feature. The payoff is that no credential remains in the
-- table the public site reads, so a widened query there can't leak one — the
-- guarantee stops depending on someone maintaining a list.
--> statement-breakpoint
CREATE TABLE `mail_settings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`smtp_host` text, `smtp_port` integer DEFAULT 587, `smtp_user` text, `smtp_password` text,
	`smtp_from_address` text, `smtp_from_name` text, `smtp_tls` integer DEFAULT true
);--> statement-breakpoint
INSERT INTO `mail_settings` (`smtp_host`, `smtp_port`, `smtp_user`, `smtp_password`, `smtp_from_address`, `smtp_from_name`, `smtp_tls`) SELECT `smtp_host`, `smtp_port`, `smtp_user`, `smtp_password`, `smtp_from_address`, `smtp_from_name`, `smtp_tls` FROM `settings`;--> statement-breakpoint
CREATE TABLE `discord_settings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`webhook_url` text, `enabled` integer DEFAULT false, `schedule` text DEFAULT 'weekly',
	`schedule_day` integer DEFAULT 1, `schedule_time` text DEFAULT '09:00', `last_sent` integer
);--> statement-breakpoint
INSERT INTO `discord_settings` (`webhook_url`, `enabled`, `schedule`, `schedule_day`, `schedule_time`, `last_sent`) SELECT `discord_webhook_url`, `discord_enabled`, `discord_schedule`, `discord_schedule_day`, `discord_schedule_time`, `discord_last_sent` FROM `settings`;--> statement-breakpoint
CREATE TABLE `clip_settings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`graphics_media_ids` text DEFAULT '[]', `default_graphic_media_id` integer,
	`default_description` text, `default_tag_ids` text DEFAULT '[]',
	`review_webhook_url` text, `published_webhook_url` text, `publish_webhook_url` text,
	`publish_enabled` integer DEFAULT false, `publish_interval_days` integer DEFAULT 3,
	`publish_hour` integer DEFAULT 10, `publish_last_sent` integer, `publish_secret` text
);--> statement-breakpoint
INSERT INTO `clip_settings` (`graphics_media_ids`, `default_graphic_media_id`, `default_description`, `default_tag_ids`, `review_webhook_url`, `published_webhook_url`, `publish_webhook_url`, `publish_enabled`, `publish_interval_days`, `publish_hour`, `publish_last_sent`, `publish_secret`) SELECT `clip_graphics_media_ids`, `default_clip_graphic_media_id`, `clip_default_description`, `clip_default_tag_ids`, `discord_clips_webhook_url`, `clip_published_webhook_url`, `publish_webhook_url`, `publish_enabled`, `publish_interval_days`, `publish_hour`, `publish_last_sent`, `publish_secret` FROM `settings`;--> statement-breakpoint
CREATE TABLE `provider_settings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`google_api_key` text, `google_places_enabled` integer DEFAULT true,
	`google_youtube_enabled` integer DEFAULT true, `youtube_channel_id` text,
	`spotify_client_id` text, `spotify_client_secret` text, `spotify_artist_id` text,
	`spotify_access_token` text, `spotify_refresh_token` text, `spotify_token_expiry` integer
);--> statement-breakpoint
INSERT INTO `provider_settings` (`google_api_key`, `google_places_enabled`, `google_youtube_enabled`, `youtube_channel_id`, `spotify_client_id`, `spotify_client_secret`, `spotify_artist_id`, `spotify_access_token`, `spotify_refresh_token`, `spotify_token_expiry`) SELECT `google_api_key`, `google_places_enabled`, `google_youtube_enabled`, `youtube_channel_id`, `spotify_client_id`, `spotify_client_secret`, `spotify_artist_id`, `spotify_access_token`, `spotify_refresh_token`, `spotify_token_expiry` FROM `settings`;--> statement-breakpoint
CREATE TABLE `pixel_settings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`meta_pixel_id` text, `meta_capi_token` text, `tiktok_pixel_id` text
);--> statement-breakpoint
INSERT INTO `pixel_settings` (`meta_pixel_id`, `meta_capi_token`, `tiktok_pixel_id`) SELECT `meta_pixel_id`, `meta_capi_token`, `tiktok_pixel_id` FROM `settings`;--> statement-breakpoint
-- The moved columns, now that their data is safely elsewhere.--> statement-breakpoint
ALTER TABLE `settings` DROP COLUMN `smtp_host`;--> statement-breakpoint
ALTER TABLE `settings` DROP COLUMN `smtp_port`;--> statement-breakpoint
ALTER TABLE `settings` DROP COLUMN `smtp_user`;--> statement-breakpoint
ALTER TABLE `settings` DROP COLUMN `smtp_password`;--> statement-breakpoint
ALTER TABLE `settings` DROP COLUMN `smtp_from_address`;--> statement-breakpoint
ALTER TABLE `settings` DROP COLUMN `smtp_from_name`;--> statement-breakpoint
ALTER TABLE `settings` DROP COLUMN `smtp_tls`;--> statement-breakpoint
ALTER TABLE `settings` DROP COLUMN `discord_webhook_url`;--> statement-breakpoint
ALTER TABLE `settings` DROP COLUMN `discord_enabled`;--> statement-breakpoint
ALTER TABLE `settings` DROP COLUMN `discord_schedule`;--> statement-breakpoint
ALTER TABLE `settings` DROP COLUMN `discord_schedule_day`;--> statement-breakpoint
ALTER TABLE `settings` DROP COLUMN `discord_schedule_time`;--> statement-breakpoint
ALTER TABLE `settings` DROP COLUMN `discord_last_sent`;--> statement-breakpoint
ALTER TABLE `settings` DROP COLUMN `clip_graphics_media_ids`;--> statement-breakpoint
ALTER TABLE `settings` DROP COLUMN `default_clip_graphic_media_id`;--> statement-breakpoint
ALTER TABLE `settings` DROP COLUMN `clip_default_description`;--> statement-breakpoint
ALTER TABLE `settings` DROP COLUMN `clip_default_tag_ids`;--> statement-breakpoint
ALTER TABLE `settings` DROP COLUMN `discord_clips_webhook_url`;--> statement-breakpoint
ALTER TABLE `settings` DROP COLUMN `clip_published_webhook_url`;--> statement-breakpoint
ALTER TABLE `settings` DROP COLUMN `publish_webhook_url`;--> statement-breakpoint
ALTER TABLE `settings` DROP COLUMN `publish_enabled`;--> statement-breakpoint
ALTER TABLE `settings` DROP COLUMN `publish_interval_days`;--> statement-breakpoint
ALTER TABLE `settings` DROP COLUMN `publish_hour`;--> statement-breakpoint
ALTER TABLE `settings` DROP COLUMN `publish_last_sent`;--> statement-breakpoint
ALTER TABLE `settings` DROP COLUMN `publish_secret`;--> statement-breakpoint
ALTER TABLE `settings` DROP COLUMN `google_api_key`;--> statement-breakpoint
ALTER TABLE `settings` DROP COLUMN `google_places_enabled`;--> statement-breakpoint
ALTER TABLE `settings` DROP COLUMN `google_youtube_enabled`;--> statement-breakpoint
ALTER TABLE `settings` DROP COLUMN `youtube_channel_id`;--> statement-breakpoint
ALTER TABLE `settings` DROP COLUMN `spotify_client_id`;--> statement-breakpoint
ALTER TABLE `settings` DROP COLUMN `spotify_client_secret`;--> statement-breakpoint
ALTER TABLE `settings` DROP COLUMN `spotify_artist_id`;--> statement-breakpoint
ALTER TABLE `settings` DROP COLUMN `spotify_access_token`;--> statement-breakpoint
ALTER TABLE `settings` DROP COLUMN `spotify_refresh_token`;--> statement-breakpoint
ALTER TABLE `settings` DROP COLUMN `spotify_token_expiry`;--> statement-breakpoint
ALTER TABLE `settings` DROP COLUMN `meta_pixel_id`;--> statement-breakpoint
ALTER TABLE `settings` DROP COLUMN `meta_capi_token`;--> statement-breakpoint
ALTER TABLE `settings` DROP COLUMN `tiktok_pixel_id`;
