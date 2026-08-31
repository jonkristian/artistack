-- Where a crop came from.
--
-- A cropped image had no way back to the picture it was taken from, so Edit
-- reopened the crop itself: each pass cropped a crop, losing a little more of
-- the frame and a little more quality, and the part you'd trimmed was gone for
-- good.
--
-- Null for anything that isn't a derivative, which is almost everything.

ALTER TABLE `media` ADD `source_media_id` integer;--> statement-breakpoint

CREATE INDEX `media_source_media_id_idx` ON `media` (`source_media_id`);
