-- Whether a click came from a phone. Decides whether a destination should be an
-- app deep link or a web URL — page_views has had the equivalent all along.
ALTER TABLE `link_clicks` ADD `device` text;
