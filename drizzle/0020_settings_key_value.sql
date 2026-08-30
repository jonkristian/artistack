-- Settings become one row per key, values as JSON.
--
-- Columns were the wrong shape twice: a 59-column singleton that leaked
-- credentials through a public `select *`, then six typed tables that still
-- needed a migration per setting — and SQLite never enforced those types
-- anyway. Validation moves to valibot at the boundary, where it also runs.
--
-- `secret` makes "everything the public site may see" a query instead of a
-- list someone has to keep correct.

CREATE TABLE `settings_kv` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text,
	`secret` integer DEFAULT false NOT NULL,
	`created_at` integer,
	`updated_at` integer
);--> statement-breakpoint
INSERT INTO `settings_kv` (`key`,`value`,`secret`,`created_at`,`updated_at`)
SELECT 'site', json_object('title', site_title, 'locale', locale, 'layout', layout, 'setupCompleted', json(CASE WHEN setup_completed THEN 'true' ELSE 'false' END), 'showShareButton', json(CASE WHEN show_share_button THEN 'true' ELSE 'false' END), 'faviconUrl', favicon_url, 'faviconGenerated', favicon_generated), 0, CAST(strftime('%s','now') AS INTEGER), CAST(strftime('%s','now') AS INTEGER) FROM `settings`;--> statement-breakpoint
INSERT INTO `settings_kv` (`key`,`value`,`secret`,`created_at`,`updated_at`)
SELECT 'theme', json_object('colorBg', color_bg, 'colorCard', color_card, 'colorAccent', color_accent, 'colorText', color_text, 'colorTextMuted', color_text_muted, 'colorIcon', color_icon), 0, CAST(strftime('%s','now') AS INTEGER), CAST(strftime('%s','now') AS INTEGER) FROM `settings`;--> statement-breakpoint
INSERT INTO `settings_kv` (`key`,`value`,`secret`,`created_at`,`updated_at`)
SELECT 'features', json_object('pressKit', json(CASE WHEN press_kit_enabled THEN 'true' ELSE 'false' END), 'showPressKit', json(CASE WHEN show_press_kit THEN 'true' ELSE 'false' END), 'pressKitMediaIds', json(COALESCE(press_kit_media_ids, '[]')), 'clips', json(CASE WHEN clips_enabled THEN 'true' ELSE 'false' END), 'releases', json(CASE WHEN releases_enabled THEN 'true' ELSE 'false' END), 'subscribers', json(CASE WHEN subscribers_enabled THEN 'true' ELSE 'false' END), 'pixels', json(CASE WHEN pixels_enabled THEN 'true' ELSE 'false' END)), 0, CAST(strftime('%s','now') AS INTEGER), CAST(strftime('%s','now') AS INTEGER) FROM `settings`;--> statement-breakpoint
INSERT INTO `settings_kv` (`key`,`value`,`secret`,`created_at`,`updated_at`)
SELECT 'mail', json_object('smtpHost', smtp_host, 'smtpPort', smtp_port, 'smtpUser', smtp_user, 'smtpPassword', smtp_password, 'smtpFromAddress', smtp_from_address, 'smtpFromName', smtp_from_name, 'smtpTls', json(CASE WHEN smtp_tls THEN 'true' ELSE 'false' END)), 1, CAST(strftime('%s','now') AS INTEGER), CAST(strftime('%s','now') AS INTEGER) FROM `mail_settings`;--> statement-breakpoint
INSERT INTO `settings_kv` (`key`,`value`,`secret`,`created_at`,`updated_at`)
SELECT 'discord', json_object('webhookUrl', webhook_url, 'enabled', json(CASE WHEN enabled THEN 'true' ELSE 'false' END), 'schedule', schedule, 'scheduleDay', schedule_day, 'scheduleTime', schedule_time, 'lastSent', last_sent), 1, CAST(strftime('%s','now') AS INTEGER), CAST(strftime('%s','now') AS INTEGER) FROM `discord_settings`;--> statement-breakpoint
INSERT INTO `settings_kv` (`key`,`value`,`secret`,`created_at`,`updated_at`)
SELECT 'clips', json_object('graphicsMediaIds', json(COALESCE(graphics_media_ids, '[]')), 'defaultGraphicMediaId', default_graphic_media_id, 'defaultDescription', default_description, 'defaultTagIds', json(COALESCE(default_tag_ids, '[]')), 'reviewWebhookUrl', review_webhook_url, 'publishedWebhookUrl', published_webhook_url, 'publishWebhookUrl', publish_webhook_url, 'publishEnabled', json(CASE WHEN publish_enabled THEN 'true' ELSE 'false' END), 'publishIntervalDays', publish_interval_days, 'publishHour', publish_hour, 'publishLastSent', publish_last_sent, 'publishSecret', publish_secret), 1, CAST(strftime('%s','now') AS INTEGER), CAST(strftime('%s','now') AS INTEGER) FROM `clip_settings`;--> statement-breakpoint
INSERT INTO `settings_kv` (`key`,`value`,`secret`,`created_at`,`updated_at`)
SELECT 'providers', json_object('googleApiKey', google_api_key, 'googlePlacesEnabled', json(CASE WHEN google_places_enabled THEN 'true' ELSE 'false' END), 'googleYoutubeEnabled', json(CASE WHEN google_youtube_enabled THEN 'true' ELSE 'false' END), 'youtubeChannelId', youtube_channel_id, 'spotifyClientId', spotify_client_id, 'spotifyClientSecret', spotify_client_secret, 'spotifyArtistId', spotify_artist_id, 'spotifyAccessToken', spotify_access_token, 'spotifyRefreshToken', spotify_refresh_token, 'spotifyTokenExpiry', spotify_token_expiry), 1, CAST(strftime('%s','now') AS INTEGER), CAST(strftime('%s','now') AS INTEGER) FROM `provider_settings`;--> statement-breakpoint
INSERT INTO `settings_kv` (`key`,`value`,`secret`,`created_at`,`updated_at`)
SELECT 'pixels', json_object('metaPixelId', meta_pixel_id, 'metaCapiToken', meta_capi_token, 'tiktokPixelId', tiktok_pixel_id), 1, CAST(strftime('%s','now') AS INTEGER), CAST(strftime('%s','now') AS INTEGER) FROM `pixel_settings`;--> statement-breakpoint
DROP TABLE `settings`;--> statement-breakpoint
DROP TABLE `mail_settings`;--> statement-breakpoint
DROP TABLE `discord_settings`;--> statement-breakpoint
DROP TABLE `clip_settings`;--> statement-breakpoint
DROP TABLE `provider_settings`;--> statement-breakpoint
DROP TABLE `pixel_settings`;--> statement-breakpoint
ALTER TABLE `settings_kv` RENAME TO `settings`;
