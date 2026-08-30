-- Cover art moves from a media FK to the URL MediaPicker returns.
--
-- MediaPicker is how every other image is chosen in the admin — the image
-- block, the gallery, the favicon — and it hands back a URL, which may be a
-- crop that has no row of its own. Storing the id meant the picker's answer had
-- to be translated back into a row that might not exist.
ALTER TABLE `releases` ADD `cover_url` text;--> statement-breakpoint

UPDATE `releases`
SET `cover_url` = (SELECT `url` FROM `media` WHERE `media`.`id` = `releases`.`cover_media_id`)
WHERE `cover_media_id` IS NOT NULL;--> statement-breakpoint

ALTER TABLE `releases` DROP COLUMN `cover_media_id`;
