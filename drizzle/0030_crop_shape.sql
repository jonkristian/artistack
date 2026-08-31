-- The frame a crop was taken in.
--
-- The crop dialog emitted a shape that nothing kept, so reopening Edit started
-- from the default every time: the proportions and rounding you'd chosen were
-- gone, and you had to set them again to make the same crop.
--
-- On the crop's own row rather than on whatever is using it, so shows, act
-- logos, release covers and image blocks all get it from one place.

ALTER TABLE `media` ADD `crop_shape` text;
