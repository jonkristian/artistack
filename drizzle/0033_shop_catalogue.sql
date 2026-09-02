-- Products become sellable things rather than a table nothing reads.
--
-- `type` splits what has to happen after a sale: a t-shirt needs an address and
-- posting, a download needs delivering. Everything downstream — stock,
-- fulfilment, what an order screen shows — turns on it, so it isn't nullable.
--
-- `stock` is null for unlimited, which is what a download is and what a
-- made-to-order item can be. A number means it runs out.
--
-- `image_url` replaces `media_id`, which was a foreign key where every other
-- picture in the app — a release cover, a show poster, an act's logo — is the
-- URL the media picker returns. One convention, and the picker can't hand back
-- an id anyway. The column is dropped rather than kept: nothing has used it.
--
-- `file_url` is what a digital sale delivers. Separate from the picture: a
-- record sleeve isn't the record.

ALTER TABLE `products` ADD `type` text DEFAULT 'physical' NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `stock` integer;--> statement-breakpoint
ALTER TABLE `products` ADD `image_url` text;--> statement-breakpoint
ALTER TABLE `products` ADD `file_url` text;--> statement-breakpoint
ALTER TABLE `products` DROP COLUMN `media_id`;
