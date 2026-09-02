-- The file an order line entitles someone to, copied onto the line.
--
-- Same reason the name and price are copied: an order has to keep working after
-- the shop has moved on. Reading the file off the live product would mean a
-- download someone paid for stops existing the day that product is deleted or
-- re-uploaded, which is a refund waiting to happen.
--
-- Null for anything physical, and for lines written before this column existed.
ALTER TABLE `order_items` ADD `file_url` text;
