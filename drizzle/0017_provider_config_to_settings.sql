-- Provider credentials move out of the cache table and into settings.
--
-- `integrations` was doing two jobs: holding configuration (an API key, two
-- enable flags) and caching API responses. Configuration is the same kind of
-- thing as the SMTP and Discord settings, so it belongs beside them as typed
-- columns; what's left is honestly a cache.
--
-- Evidence it had drifted: `google_places_api_key` already existed on settings,
-- unread, because the field lived here first and the original was never dropped.

ALTER TABLE `settings` ADD `google_api_key` text;--> statement-breakpoint
ALTER TABLE `settings` ADD `google_places_enabled` integer DEFAULT true;--> statement-breakpoint
ALTER TABLE `settings` ADD `google_youtube_enabled` integer DEFAULT true;--> statement-breakpoint
ALTER TABLE `settings` ADD `youtube_channel_id` text;--> statement-breakpoint
ALTER TABLE `settings` ADD `spotify_client_id` text;--> statement-breakpoint
ALTER TABLE `settings` ADD `spotify_client_secret` text;--> statement-breakpoint
ALTER TABLE `settings` ADD `spotify_artist_id` text;--> statement-breakpoint
ALTER TABLE `settings` ADD `spotify_access_token` text;--> statement-breakpoint
ALTER TABLE `settings` ADD `spotify_refresh_token` text;--> statement-breakpoint
ALTER TABLE `settings` ADD `spotify_token_expiry` integer;--> statement-breakpoint

-- Lift the JSON values into their columns before the config column goes.
UPDATE `settings` SET
  `google_api_key` = (SELECT json_extract(config, '$.apiKey') FROM `integrations` WHERE provider = 'google'),
  `google_places_enabled` = COALESCE((SELECT json_extract(config, '$.placesEnabled') FROM `integrations` WHERE provider = 'google'), 1),
  `google_youtube_enabled` = COALESCE((SELECT json_extract(config, '$.youtubeEnabled') FROM `integrations` WHERE provider = 'google'), 1),
  `youtube_channel_id` = (SELECT json_extract(config, '$.youtubeChannelId') FROM `integrations` WHERE provider = 'google'),
  `spotify_client_id` = (SELECT json_extract(config, '$.clientId') FROM `integrations` WHERE provider = 'spotify'),
  `spotify_client_secret` = (SELECT json_extract(config, '$.clientSecret') FROM `integrations` WHERE provider = 'spotify'),
  `spotify_artist_id` = (SELECT json_extract(config, '$.artistId') FROM `integrations` WHERE provider = 'spotify'),
  `spotify_access_token` = (SELECT json_extract(config, '$.accessToken') FROM `integrations` WHERE provider = 'spotify'),
  `spotify_refresh_token` = (SELECT json_extract(config, '$.refreshToken') FROM `integrations` WHERE provider = 'spotify'),
  `spotify_token_expiry` = (SELECT json_extract(config, '$.tokenExpiry') FROM `integrations` WHERE provider = 'spotify');--> statement-breakpoint

ALTER TABLE `integrations` DROP COLUMN `config`;--> statement-breakpoint
ALTER TABLE `integrations` DROP COLUMN `enabled`;--> statement-breakpoint

-- The duplicate that started all this.
ALTER TABLE `settings` DROP COLUMN `google_places_api_key`;
