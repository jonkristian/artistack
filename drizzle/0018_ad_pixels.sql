-- Ad pixels. Ids are public (rendered into the page); the Conversions API token
-- is a server-to-server credential and is treated as one.
ALTER TABLE `settings` ADD `meta_pixel_id` text;--> statement-breakpoint
ALTER TABLE `settings` ADD `meta_capi_token` text;--> statement-breakpoint
ALTER TABLE `settings` ADD `tiktok_pixel_id` text;--> statement-breakpoint
ALTER TABLE `settings` ADD `pixels_enabled` integer DEFAULT false;
