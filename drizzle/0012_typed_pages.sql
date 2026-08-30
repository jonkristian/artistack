-- Pages become the routing and identity layer for every public URL.
--
-- Hand-written rather than generated: this moves data as well as structure.
-- Slug, SEO, share image and published state move off `releases` and onto the
-- `pages` row that owns the URL, so there is exactly one answer to "what lives
-- at this address and is it live".

ALTER TABLE `pages` ADD `share_image_url` text;--> statement-breakpoint

-- The artist page. It renders at `/`, so its slug is an internal handle and is
-- reserved from public use. Titled from settings, falling back to the profile
-- name, so an existing site keeps the name it already goes by.
INSERT INTO `pages` (`slug`, `title`, `type`, `published`, `position`, `created_at`)
SELECT
  'home',
  COALESCE(
    NULLIF((SELECT `site_title` FROM `settings` LIMIT 1), ''),
    NULLIF((SELECT `name` FROM `profile` LIMIT 1), ''),
    'Home'
  ),
  'landing',
  1,
  0,
  CAST(strftime('%s', 'now') AS INTEGER)
WHERE NOT EXISTS (SELECT 1 FROM `pages` WHERE `type` = 'landing');--> statement-breakpoint

-- Existing blocks predate pages and used NULL to mean "the home page".
UPDATE `blocks`
SET `page_id` = (SELECT `id` FROM `pages` WHERE `type` = 'landing' LIMIT 1)
WHERE `page_id` IS NULL;--> statement-breakpoint

-- One page per existing release, carrying over what is now page-level.
INSERT INTO `pages` (`slug`, `title`, `type`, `description`, `share_image_url`, `published`, `position`, `created_at`)
SELECT
  `slug`,
  `title`,
  'release',
  `description`,
  `share_image_url`,
  COALESCE(`published`, 0),
  0,
  COALESCE(`created_at`, CAST(strftime('%s', 'now') AS INTEGER))
FROM `releases`;--> statement-breakpoint

CREATE TABLE `__new_releases` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`page_id` integer NOT NULL,
	`title` text NOT NULL,
	`release_date` integer NOT NULL,
	`cover_media_id` integer,
	`presave_url` text,
	`isrc` text,
	`upc` text,
	`created_at` integer
);--> statement-breakpoint

-- Joined on slug because that is what the two tables still share at this point;
-- the slug column disappears from releases in the swap below.
INSERT INTO `__new_releases` (`id`, `page_id`, `title`, `release_date`, `cover_media_id`, `presave_url`, `isrc`, `upc`, `created_at`)
SELECT r.`id`, p.`id`, r.`title`, r.`release_date`, r.`cover_media_id`, r.`presave_url`, r.`isrc`, r.`upc`, r.`created_at`
FROM `releases` r
JOIN `pages` p ON p.`slug` = r.`slug` AND p.`type` = 'release';--> statement-breakpoint

DROP TABLE `releases`;--> statement-breakpoint
ALTER TABLE `__new_releases` RENAME TO `releases`;--> statement-breakpoint
CREATE UNIQUE INDEX `releases_page_id_unique` ON `releases` (`page_id`);
