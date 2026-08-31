-- `shows.time` goes.
--
-- It meant "the show starting", which is now the first act's set time — the
-- line-up owns running order, so a second copy on the show could only disagree
-- with it. Nothing has written this column since acts gained times.
--
-- The value isn't thrown away: it becomes the opening act's set time where that
-- act hasn't got one, which is what it was describing. A show with a time and
-- no acts has nowhere to put it and loses it — there is no line-up for it to
-- belong to.

UPDATE `show_acts`
SET `set_time` = (SELECT s.`time` FROM `shows` s WHERE s.`id` = `show_acts`.`show_id`)
WHERE `set_time` IS NULL
  AND `position` = 0
  AND EXISTS (
    SELECT 1 FROM `shows` s
    WHERE s.`id` = `show_acts`.`show_id` AND s.`time` IS NOT NULL AND s.`time` <> ''
  );--> statement-breakpoint

ALTER TABLE `shows` DROP COLUMN `time`;
