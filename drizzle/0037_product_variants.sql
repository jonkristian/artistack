-- Sizes.
--
-- A t-shirt isn't one thing with one count — you sell out of M while the S sit
-- there. So stock moves onto the variant, and a basket line has to say which
-- one it is.
--
-- Variants are JSON on the product rather than a table of their own. They have
-- no identity worth keeping: nobody links to a size, reports on a size, or
-- needs one to survive the product being deleted. A table would buy joins and
-- cascade rules for something that is a short list belonging to one row.

-- [{ "name": "M", "stock": 12 }, …]. Null or empty means the product has none,
-- and its own `stock` column is the count — which is most products.
ALTER TABLE `products` ADD `variants` text;--> statement-breakpoint

-- Copied onto the order line like the name and the price, so a receipt still
-- says which size was bought after the product has been edited.
ALTER TABLE `order_items` ADD `variant` text;--> statement-breakpoint

/*
 * cart_items is rebuilt because its key changes.
 *
 * It was PRIMARY KEY (cart_id, product_id) — one line per product — and two
 * sizes of the same shirt are two lines. SQLite can't alter a primary key, so
 * the table is remade and copied across.
 *
 * `variant` is NOT NULL DEFAULT '' rather than nullable on purpose. SQLite
 * permits NULLs in a primary key and treats every one as distinct, so a
 * nullable column here would silently stop the key working for every product
 * that has no variants — which is the common case. Empty string is the
 * no-variant variant.
 */
CREATE TABLE `cart_items_new` (
	`cart_id` integer NOT NULL,
	`product_id` integer NOT NULL,
	`variant` text DEFAULT '' NOT NULL,
	`quantity` integer DEFAULT 1 NOT NULL,
	PRIMARY KEY (`cart_id`, `product_id`, `variant`)
);--> statement-breakpoint

INSERT INTO `cart_items_new` (`cart_id`, `product_id`, `variant`, `quantity`)
	SELECT `cart_id`, `product_id`, '', `quantity` FROM `cart_items`;--> statement-breakpoint

DROP TABLE `cart_items`;--> statement-breakpoint
ALTER TABLE `cart_items_new` RENAME TO `cart_items`;--> statement-breakpoint
CREATE INDEX `cart_items_product_id_idx` ON `cart_items` (`product_id`);
