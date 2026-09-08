-- What a clip has to work with, apart from where any of it goes.
--
-- Adding media and placing it were one action: every `clip_sources` row is a
-- placement, so the only way to have a file available was to already have it on
-- the timeline, and using the same shot three times meant three trips to the
-- picker. The list beside the strip was the strip, written out again.
--
-- This is the pool. A file is in it once; placements point at the same media and
-- there can be any number of them, or none.
CREATE TABLE `clip_media` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` integer NOT NULL,
	`media_id` integer NOT NULL,
	`position` integer DEFAULT 0,
	`created_at` integer
);
--> statement-breakpoint
CREATE INDEX `clip_media_project_id_idx` ON `clip_media` (`project_id`);
--> statement-breakpoint
-- One row per file per project: the pool is a set, not a list of uses.
CREATE UNIQUE INDEX `clip_media_project_media_idx` ON `clip_media` (`project_id`,`media_id`);
--> statement-breakpoint
-- Seeded from what every project already refers to, so nothing that is on a
-- timeline today drops out of the list beside it.
INSERT OR IGNORE INTO `clip_media` (`project_id`, `media_id`, `position`, `created_at`)
SELECT `project_id`, `media_id`, MIN(`position`), unixepoch()
FROM `clip_sources` GROUP BY `project_id`, `media_id`;
--> statement-breakpoint
INSERT OR IGNORE INTO `clip_media` (`project_id`, `media_id`, `position`, `created_at`)
SELECT `project_id`, `media_id`, 100 + MIN(`position`), unixepoch()
FROM `clip_audio` GROUP BY `project_id`, `media_id`;
