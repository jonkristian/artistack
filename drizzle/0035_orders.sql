-- What was bought, and what still has to happen about it.
--
-- Two states, not one. `payment_status` is what the provider says; `fulfilment`
-- is what you've done about it. A paid order that hasn't been posted and a
-- posted order that was never captured are both real, and one column couldn't
-- describe either.
--
-- Money is authorised at checkout and captured when the parcel goes out, which
-- is why `authorised` and `captured` are distinct rather than a single "paid".

CREATE TABLE `orders` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`reference` text NOT NULL,
	`buyer_name` text NOT NULL,
	`buyer_email` text NOT NULL,
	`buyer_phone` text,

	-- Null for an order with nothing to post.
	`address_line` text,
	`postcode` text,
	`city` text,
	`country` text,

	`provider` text NOT NULL,
	-- The provider's own id for the payment, for reconciling and refunding.
	`provider_reference` text,
	`payment_status` text DEFAULT 'pending' NOT NULL,
	`fulfilment` text DEFAULT 'none' NOT NULL,

	`amount` integer NOT NULL,
	`currency` text NOT NULL,

	`note` text,
	`created_at` integer,
	`updated_at` integer
);--> statement-breakpoint

-- Ours, not the provider's: it goes in the payment request, comes back on the
-- webhook, and is what a customer quotes at you in an email.
CREATE UNIQUE INDEX `orders_reference_unique` ON `orders` (`reference`);--> statement-breakpoint
CREATE INDEX `orders_payment_status_idx` ON `orders` (`payment_status`);--> statement-breakpoint

/*
 * The lines of an order, with the name and price copied onto them.
 *
 * Not a join to the live product: an order has to stay truthful after a rename,
 * a price change or a deletion. A receipt that can't say what was bought, or
 * that quietly restates today's price, isn't a receipt.
 */
CREATE TABLE `order_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`order_id` integer NOT NULL,
	-- Kept for stock and for linking back where the product still exists, but
	-- nothing about the sale depends on it.
	`product_id` integer,
	`name` text NOT NULL,
	`unit_price` integer NOT NULL,
	`quantity` integer DEFAULT 1 NOT NULL,
	`type` text NOT NULL,
	-- Unguessable, and only for a download. Issued once the money is in.
	`download_token` text
);--> statement-breakpoint

CREATE INDEX `order_items_order_id_idx` ON `order_items` (`order_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `order_items_download_token_unique` ON `order_items` (`download_token`) WHERE `download_token` IS NOT NULL;
