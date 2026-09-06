-- Fades become a yes or no, and the crossfade stops being a number at all.
--
-- Two things were being asked of whoever added a track. "How long should the
-- fade be" has one good answer nearly always, so it moves to the advanced dials
-- as one setting for the clip rather than a field on every bed. And "how long
-- should the crossfade be" was asking someone to describe a handover they had
-- already drawn: if one bed runs past where the next begins, the length of that
-- overlap IS the crossfade, and the renderer can read it off the timeline.
--
-- Rebuilt rather than altered because SQLite can't change a column's type, and
-- these were REAL seconds that are now flags. `fade_in > 0` carries the old
-- meaning across exactly: a track that had a fade keeps one.
CREATE TABLE `__new_clip_audio` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` integer NOT NULL,
	`media_id` integer NOT NULL,
	`position` integer DEFAULT 0,
	`start` real DEFAULT 0,
	`end` real,
	`seek` real DEFAULT 0,
	`fade_in` integer DEFAULT true,
	`fade_out` integer DEFAULT true,
	`duck` integer DEFAULT false
);
--> statement-breakpoint
INSERT INTO `__new_clip_audio` (
	`id`, `project_id`, `media_id`, `position`, `start`, `end`, `seek`, `fade_in`, `fade_out`, `duck`
)
SELECT
	`id`, `project_id`, `media_id`, `position`, `start`, `end`, `seek`,
	CASE WHEN `fade_in` > 0 THEN 1 ELSE 0 END,
	CASE WHEN `fade_out` > 0 THEN 1 ELSE 0 END,
	`duck`
FROM `clip_audio`;
--> statement-breakpoint
DROP TABLE `clip_audio`;
--> statement-breakpoint
ALTER TABLE `__new_clip_audio` RENAME TO `clip_audio`;
--> statement-breakpoint
CREATE INDEX `clip_audio_project_id_idx` ON `clip_audio` (`project_id`);
