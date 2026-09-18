-- Link clicks get the same ninety-day rollup page views have, so the privacy
-- page's promise holds for both. And page views whose path was a secret — a
-- paid download, an unsubscribe link, a phone-upload code — are removed: the
-- token was the path, and none of them was a visit to the site.

CREATE TABLE `link_click_daily` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`link_id` integer NOT NULL,
	`referrer` text,
	`country` text,
	`device` text,
	`clicks` integer NOT NULL
);--> statement-breakpoint

CREATE INDEX `link_click_daily_date_idx` ON `link_click_daily` (`date`);--> statement-breakpoint
CREATE INDEX `link_click_daily_link_id_idx` ON `link_click_daily` (`link_id`);--> statement-breakpoint

DELETE FROM `page_views` WHERE `path` LIKE '/shop/download/%'
  OR `path` LIKE '/shop/test-payment%'
  OR `path` LIKE '/unsubscribe/%'
  OR `path` LIKE '/u/%';--> statement-breakpoint

DELETE FROM `page_view_daily` WHERE `path` LIKE '/shop/download/%'
  OR `path` LIKE '/shop/test-payment%'
  OR `path` LIKE '/unsubscribe/%'
  OR `path` LIKE '/u/%';
