CREATE TABLE `releases` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`release_date` integer NOT NULL,
	`description` text,
	`cover_media_id` integer,
	`share_image_url` text,
	`presave_url` text,
	`isrc` text,
	`upc` text,
	`published` integer DEFAULT false,
	`created_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `releases_slug_unique` ON `releases` (`slug`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_links` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`block_id` integer,
	`release_id` integer,
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
-- release_id is deliberately absent from both lists: the old table has no such
-- column, so selecting it fails. Omitted, every migrated row gets NULL, which is
-- correct — every existing link belongs to a block.
INSERT INTO `__new_links`("id", "block_id", "category", "platform", "url", "label", "thumbnail_url", "embed_data", "position", "visible") SELECT "id", "block_id", "category", "platform", "url", "label", "thumbnail_url", "embed_data", "position", "visible" FROM `links`;--> statement-breakpoint
DROP TABLE `links`;--> statement-breakpoint
ALTER TABLE `__new_links` RENAME TO `links`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `links_block_id_idx` ON `links` (`block_id`);--> statement-breakpoint
CREATE INDEX `links_release_id_idx` ON `links` (`release_id`);