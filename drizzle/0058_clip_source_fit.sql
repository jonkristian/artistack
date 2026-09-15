-- How one shot fills the frame, overriding the clip's own setting.
--
-- Null inherits, exactly as `watermark` on the same table does. Existing rows
-- therefore keep behaving as they did: the clip's `fill` decides, and nothing
-- on any timeline changes until someone sets this on a block.
ALTER TABLE `clip_sources` ADD `fit` text;
