-- Clips stop being a queue and become placements.
--
-- A source's place on the timeline was implicit: after everything before it.
-- That made three things impossible at once — a gap, two pictures over each
-- other, and the same footage used twice in different places with different
-- parts of it. The last of those already half-worked, since nothing stopped a
-- file being added twice, but the copies could only ever play back to back.
--
-- `start` is where it begins, in seconds. `lane` is which row it sits in, and
-- so what covers what when two overlap.
--
-- Backfilled from the order they were already in, so every existing clip plays
-- exactly as it did: each placement starts where the one before it ended.
-- Computed in SQL rather than in a migration script because the lengths are
-- already there — a trim window if it has one, the media's own duration if not.
ALTER TABLE `clip_sources` ADD `start` real DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `clip_sources` ADD `lane` integer DEFAULT 0;
--> statement-breakpoint
UPDATE `clip_sources` SET `start` = COALESCE((
  SELECT SUM(
    CASE
      WHEN prev.`trim_start` IS NOT NULL AND prev.`trim_end` IS NOT NULL
        THEN MAX(0, prev.`trim_end` - prev.`trim_start`)
      ELSE COALESCE((SELECT m.`duration_ms` FROM `media` m WHERE m.`id` = prev.`media_id`), 0) / 1000.0
    END
  )
  FROM `clip_sources` prev
  WHERE prev.`project_id` = `clip_sources`.`project_id`
    AND prev.`position` < `clip_sources`.`position`
), 0);
--> statement-breakpoint
-- Beds get a lane for the same reason: which row a thing is in is how a
-- timeline says what sits over what. They already knew when they start and
-- stop.
ALTER TABLE `clip_audio` ADD `lane` integer DEFAULT 0;
