-- Bands become acts.
--
-- "Band" named one kind of performer. A bill has solo artists, DJs and duos on
-- it too, and "act" is what the line-up of a night is actually made of.
--
-- Not folded into 0025 because that one has already been applied; a migration
-- is a record of what happened, so this is a rename rather than a rewrite of
-- history.
--
-- "Artist" was the other candidate and is deliberately avoided: this codebase
-- already uses it for the site's owner — `profile`, the artist page, artistName
-- — and a second meaning would collide with the first.

ALTER TABLE `bands` RENAME TO `acts`;--> statement-breakpoint
ALTER TABLE `show_bands` RENAME TO `show_acts`;--> statement-breakpoint
ALTER TABLE `show_acts` RENAME COLUMN `band_id` TO `act_id`;--> statement-breakpoint

-- Indexes carry across a table rename but keep their old names, and SQLite has
-- no ALTER INDEX, so they're rebuilt under the new ones.
DROP INDEX `bands_name_unique`;--> statement-breakpoint
DROP INDEX `bands_self_unique`;--> statement-breakpoint
DROP INDEX `show_bands_band_id_idx`;--> statement-breakpoint

CREATE UNIQUE INDEX `acts_name_unique` ON `acts` (`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `acts_self_unique` ON `acts` (`is_self`) WHERE `is_self` = 1;--> statement-breakpoint
CREATE INDEX `show_acts_act_id_idx` ON `show_acts` (`act_id`);
