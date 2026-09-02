-- What the options are options of.
--
-- Variants started as sizes because shirts were the case in hand, but a record
-- comes in colours and a print comes in formats. The list was already general —
-- a name and a count — so this is the missing half: what to call the choice
-- when someone is asked to make it.
--
-- Null for a product with no options, and for anything created before the
-- column existed, where "Options" is a fair enough heading.
ALTER TABLE `products` ADD `variant_label` text;
