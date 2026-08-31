-- A band becomes a thing rather than a piece of text.
--
-- The line-up was an array of names on each show, so "The How" appearing on
-- three nights was three unrelated strings. Nothing could attach a logo to a
-- band, list every show it played, or survive a rename.
--
-- Hand-written because it deduplicates as well as restructures: the names in
-- those arrays have to become one row each, and only a read of the data can
-- decide which are the same band.

CREATE TABLE `bands` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`logo_url` text,
	`is_self` integer DEFAULT false NOT NULL
);--> statement-breakpoint

CREATE UNIQUE INDEX `bands_name_unique` ON `bands` (`name`);--> statement-breakpoint

-- At most one band is the site's own act. A partial unique index makes that a
-- rule the database keeps rather than one every writer has to remember.
CREATE UNIQUE INDEX `bands_self_unique` ON `bands` (`is_self`) WHERE `is_self` = 1;--> statement-breakpoint

/*
 * Which bands played which show, and in what order.
 *
 * `position` lives here, not on the band: the site's own act opens some nights
 * and headlines others, so running order is a fact about the show rather than
 * about either end of the relationship.
 */
CREATE TABLE `show_bands` (
	`show_id` integer NOT NULL,
	`band_id` integer NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY (`show_id`, `band_id`)
);--> statement-breakpoint

CREATE INDEX `show_bands_band_id_idx` ON `show_bands` (`band_id`);--> statement-breakpoint

-- One row per distinct name across every line-up.
INSERT INTO `bands` (`name`)
SELECT DISTINCT trim(j.value)
FROM `shows` s, json_each(s.`lineup`) j
WHERE trim(j.value) <> '';--> statement-breakpoint

-- `j.key` is the array index, which is the running order the arrays carried.
INSERT INTO `show_bands` (`show_id`, `band_id`, `position`)
SELECT s.`id`, b.`id`, j.key
FROM `shows` s, json_each(s.`lineup`) j
JOIN `bands` b ON b.`name` = trim(j.value)
WHERE trim(j.value) <> '';--> statement-breakpoint

-- The act whose name matches the site's own. Matched on name because that is
-- the only thing the two have ever shared; from here the flag is what says so.
UPDATE `bands`
SET `is_self` = 1
WHERE `name` = (SELECT `name` FROM `profile` LIMIT 1);--> statement-breakpoint

ALTER TABLE `shows` DROP COLUMN `lineup`;
