-- A basket, before it becomes an order.
--
-- Identified by an unguessable token in a cookie rather than by a signed-in
-- user: nobody logs in to buy a t-shirt. The same shape as a clip's preview
-- token and a subscriber's unsubscribe token.
--
-- Carts are abandoned far more often than they're completed, so they're swept
-- rather than kept. `updated_at` is what the sweep reads — a cart someone is
-- still adding to shouldn't age out from under them.

CREATE TABLE `carts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`token` text NOT NULL,
	`created_at` integer,
	`updated_at` integer
);--> statement-breakpoint

CREATE UNIQUE INDEX `carts_token_unique` ON `carts` (`token`);--> statement-breakpoint
CREATE INDEX `carts_updated_at_idx` ON `carts` (`updated_at`);--> statement-breakpoint

/*
 * One row per product in a cart — the primary key says so, so adding the same
 * thing twice raises the quantity rather than making a second line.
 *
 * No price here: a cart shows the current price, and what gets charged is
 * settled at checkout. Copying it now would let someone hold a cart open across
 * a price change and pay the old one.
 */
CREATE TABLE `cart_items` (
	`cart_id` integer NOT NULL,
	`product_id` integer NOT NULL,
	`quantity` integer DEFAULT 1 NOT NULL,
	PRIMARY KEY (`cart_id`, `product_id`)
);--> statement-breakpoint

CREATE INDEX `cart_items_product_id_idx` ON `cart_items` (`product_id`);
