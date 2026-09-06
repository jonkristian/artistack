-- Audio becomes rows, the same shape as the source clips.
--
-- A bed lived in the project's config JSON as eight loose fields — musicMediaId,
-- musicStart, musicSeek and the rest — which said, structurally, that a clip has
-- at most one piece of music. Wanting two meant either a second set of fields
-- with numbers in their names, or this.
--
-- Rows also make audio behave like everything else in a clip: something you add,
-- reorder and remove, with its own settings hanging off it, rather than a
-- special case the editor has to know about.
--
-- Times are REAL. The trim columns on clip_sources are INTEGER holding tenths,
-- which SQLite tolerates through type affinity but only by accident.
CREATE TABLE `clip_audio` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` integer NOT NULL,
	`media_id` integer NOT NULL,
	`position` integer DEFAULT 0,
	-- Where it comes in on the clip's timeline.
	`start` real DEFAULT 0,
	-- Where it comes in *from*, inside the track itself.
	`seek` real DEFAULT 0,
	`fade_in` real DEFAULT 1.5,
	`fade_out` real DEFAULT 1.5,
	-- Null is off. Set, the footage audio ends as this one comes up.
	`crossfade` real,
	-- Dip this bed under speech in the footage.
	`duck` integer DEFAULT false
);
--> statement-breakpoint
CREATE INDEX `clip_audio_project_id_idx` ON `clip_audio` (`project_id`);
--> statement-breakpoint
-- Carry the existing beds over. `config` is JSON text, so json_extract reads it
-- directly; a project with no musicMediaId simply produces no row.
INSERT INTO `clip_audio` (
	`project_id`, `media_id`, `position`, `start`, `seek`, `fade_in`, `fade_out`, `crossfade`, `duck`
)
SELECT
	`id`,
	json_extract(`config`, '$.musicMediaId'),
	0,
	COALESCE(json_extract(`config`, '$.musicStart'), 0),
	COALESCE(json_extract(`config`, '$.musicSeek'), 0),
	COALESCE(json_extract(`config`, '$.musicFadeIn'), 1.5),
	COALESCE(json_extract(`config`, '$.musicFadeOut'), 1.5),
	json_extract(`config`, '$.musicCrossfade'),
	COALESCE(json_extract(`config`, '$.duck'), 0)
FROM `clip_projects`
WHERE json_extract(`config`, '$.musicMediaId') IS NOT NULL;
