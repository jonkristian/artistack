-- One key per subject.
--
-- `providers` held Google and Spotify, `pixels` held Meta and TikTok, and
-- `clips` held both the studio's defaults and its publishing schedule. Writing
-- a setting rewrites its whole value, so a Spotify token refresh was rewriting
-- the Google key and `publishLastSent` was rewriting the graphics list — which
-- makes updated_at say the wrong thing about what changed.

INSERT INTO `settings` (`key`,`value`,`secret`,`created_at`,`updated_at`)
SELECT 'google', json_object(
  'apiKey', json_extract(value,'$.googleApiKey'),
  'placesEnabled', json(CASE WHEN json_extract(value,'$.googlePlacesEnabled') THEN 'true' ELSE 'false' END),
  'youtubeEnabled', json(CASE WHEN json_extract(value,'$.googleYoutubeEnabled') THEN 'true' ELSE 'false' END),
  'youtubeChannelId', json_extract(value,'$.youtubeChannelId')
), 1, created_at, updated_at FROM `settings` WHERE key='providers';--> statement-breakpoint

INSERT INTO `settings` (`key`,`value`,`secret`,`created_at`,`updated_at`)
SELECT 'spotify', json_object(
  'clientId', json_extract(value,'$.spotifyClientId'),
  'clientSecret', json_extract(value,'$.spotifyClientSecret'),
  'artistId', json_extract(value,'$.spotifyArtistId'),
  'accessToken', json_extract(value,'$.spotifyAccessToken'),
  'refreshToken', json_extract(value,'$.spotifyRefreshToken'),
  'tokenExpiry', json_extract(value,'$.spotifyTokenExpiry')
), 1, created_at, updated_at FROM `settings` WHERE key='providers';--> statement-breakpoint

INSERT INTO `settings` (`key`,`value`,`secret`,`created_at`,`updated_at`)
SELECT 'meta', json_object(
  'pixelId', json_extract(value,'$.metaPixelId'),
  'capiToken', json_extract(value,'$.metaCapiToken')
), 1, created_at, updated_at FROM `settings` WHERE key='pixels';--> statement-breakpoint

INSERT INTO `settings` (`key`,`value`,`secret`,`created_at`,`updated_at`)
SELECT 'tiktok', json_object(
  'pixelId', json_extract(value,'$.tiktokPixelId')
), 1, created_at, updated_at FROM `settings` WHERE key='pixels';--> statement-breakpoint

INSERT INTO `settings` (`key`,`value`,`secret`,`created_at`,`updated_at`)
SELECT 'clipPublishing', json_object(
  'publishedWebhookUrl', json_extract(value,'$.publishedWebhookUrl'),
  'publishWebhookUrl', json_extract(value,'$.publishWebhookUrl'),
  'publishEnabled', json(CASE WHEN json_extract(value,'$.publishEnabled') THEN 'true' ELSE 'false' END),
  'publishIntervalDays', json_extract(value,'$.publishIntervalDays'),
  'publishHour', json_extract(value,'$.publishHour'),
  'publishLastSent', json_extract(value,'$.publishLastSent'),
  'publishSecret', json_extract(value,'$.publishSecret')
), 1, created_at, updated_at FROM `settings` WHERE key='clips';--> statement-breakpoint

UPDATE `settings` SET value = json_object(
  'graphicsMediaIds', json(COALESCE(json_extract(value,'$.graphicsMediaIds'),'[]')),
  'defaultGraphicMediaId', json_extract(value,'$.defaultGraphicMediaId'),
  'defaultDescription', json_extract(value,'$.defaultDescription'),
  'defaultTagIds', json(COALESCE(json_extract(value,'$.defaultTagIds'),'[]')),
  'reviewWebhookUrl', json_extract(value,'$.reviewWebhookUrl')
) WHERE key='clips';--> statement-breakpoint

DELETE FROM `settings` WHERE key IN ('providers','pixels');
