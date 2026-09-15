-- A shot's own framing: how far in it sits, and whether it drifts.
--
-- Both default to "as it was", so every existing placement renders exactly as
-- it did. Panning lives here rather than on the effects lane because the lane
-- runs after `buildFill` has already cropped the overflow away — by then there
-- is no picture outside the frame left to move through.
ALTER TABLE `clip_sources` ADD `zoom` real DEFAULT 1;--> statement-breakpoint
ALTER TABLE `clip_sources` ADD `pan` integer DEFAULT false;
