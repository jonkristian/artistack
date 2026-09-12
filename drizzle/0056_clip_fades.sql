-- A shot can fade in and out, the way a bed already could.
--
-- Sound had `fade_in`/`fade_out` per track and the picture had one switch for
-- the whole clip, which could only fade its very end. So the ordinary thing —
-- this shot comes up out of nothing, that one goes away — had no way of being
-- said, and anyone wanting it reached for an effect, where it does not belong:
-- a fade is a property of an edit point, not a look laid over a region, and an
-- effect block lined up against a cut drifts the moment the shot is retrimmed.
--
-- Switches rather than durations, matching the beds: how long a fade runs is a
-- dial in Advanced, so changing your mind about it changes every fade at once
-- rather than none of them.
--
-- Written by hand, like the rest of these. `drizzle-kit generate` diffs against
-- the snapshots in `meta/`, and those stopped tracking reality several
-- migrations ago — asked for this one it emits a CREATE TABLE for `clip_audio`
-- and re-adds half a dozen columns that already exist. `scripts/migrate.mjs`
-- reads the directory rather than the journal, so a file is all that is needed.
ALTER TABLE `clip_sources` ADD `fade_in` integer DEFAULT false;--> statement-breakpoint
ALTER TABLE `clip_sources` ADD `fade_out` integer DEFAULT false;
