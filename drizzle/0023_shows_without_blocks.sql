-- Shows stop being a block's content and become the site's own, and the table
-- takes the name of the thing it holds.
--
-- "Tour dates" named the rows after a grouping most of them don't belong to: a
-- one-off gig isn't a tour date, and a tour is a wrapper around shows rather
-- than another word for them.
--
-- Hand-written rather than generated: this merges data as well as changing
-- structure, and the generator has no way to know that two blocks' shows are
-- one list.
--
-- A show is a fact about the band — a date, a venue, a ticket link — and it's
-- true whether or not something is currently rendering it. Owning it from a
-- block meant a second Tour Dates block started empty while the shows sat in
-- the first, deleting the block deleted the shows with it, and no second page
-- could ever list them.

CREATE TABLE `__new_shows` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`time` text,
	`title` text,
	`venue` text NOT NULL,
	`lineup` text,
	`ticket_url` text,
	`event_url` text,
	`sold_out` integer DEFAULT false,
	`position` integer DEFAULT 0
);--> statement-breakpoint

-- Every block's shows become one list. `position` was an ordering within a
-- block and means nothing across them, so it's renumbered by date — which is
-- the order shows are read in anyway.
INSERT INTO `__new_shows` (`id`, `date`, `time`, `title`, `venue`, `lineup`, `ticket_url`, `event_url`, `sold_out`, `position`)
SELECT
  `id`, `date`, `time`, `title`, `venue`, `lineup`, `ticket_url`, `event_url`, `sold_out`,
  ROW_NUMBER() OVER (ORDER BY `date`, `id`) - 1
FROM `tour_dates`;--> statement-breakpoint

DROP TABLE `tour_dates`;--> statement-breakpoint
ALTER TABLE `__new_shows` RENAME TO `shows`;--> statement-breakpoint
CREATE INDEX `shows_date_idx` ON `shows` (`date`);--> statement-breakpoint

-- The block that lists them is called Shows now. "Tour dates" named the rows
-- rather than the thing: a one-off gig isn't a tour date, and a tour is a
-- grouping of shows rather than another word for them.
UPDATE `blocks` SET `type` = 'shows' WHERE `type` = 'tour_dates';--> statement-breakpoint

-- A site that already has shows keeps them in the nav. Everyone else gets the
-- flag off, like releases: a site that has never listed a show shouldn't grow
-- a section for them.
UPDATE `settings`
SET `value` = json_set(`value`, '$.shows', json('true'))
WHERE `key` = 'features' AND EXISTS (SELECT 1 FROM `shows`);
