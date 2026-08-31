-- A show can have a landing page.
--
-- Optional, unlike a release: a release exists to be linked, while most gigs
-- are a line on the front page and only some are worth promoting on their own.
-- So `page_id` is nullable and the row is minted the first time it's wanted.

ALTER TABLE `shows` ADD `page_id` integer;--> statement-breakpoint

CREATE UNIQUE INDEX `shows_page_id_unique` ON `shows` (`page_id`) WHERE `page_id` IS NOT NULL;
