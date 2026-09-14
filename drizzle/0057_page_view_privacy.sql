-- Page views: keep a device class and a day-scoped visitor token, drop the raw
-- user agent, and give the table somewhere to be rolled up to.
--
-- The user agent is the reason this migration exists. A full UA string is a
-- fingerprint, and it was being kept per visit, forever. link_clicks already
-- stored the class instead; this brings page_views into line and backfills the
-- history from the strings before they go, so nothing analytical is lost.

ALTER TABLE `page_views` ADD `device` text;--> statement-breakpoint
ALTER TABLE `page_views` ADD `visitor` text;--> statement-breakpoint

-- Backfill the class from the string, matching deviceFromUserAgent(): tablet is
-- tested first, because an Android tablet says "Android" without "Mobile".
UPDATE `page_views` SET `device` = CASE
  WHEN `user_agent` IS NULL OR `user_agent` = '' THEN NULL
  WHEN lower(`user_agent`) LIKE '%ipad%'
    OR lower(`user_agent`) LIKE '%tablet%'
    OR lower(`user_agent`) LIKE '%playbook%'
    OR lower(`user_agent`) LIKE '%silk%'
    OR (lower(`user_agent`) LIKE '%android%' AND lower(`user_agent`) NOT LIKE '%mobile%')
    THEN 'tablet'
  WHEN lower(`user_agent`) LIKE '%mobi%'
    OR lower(`user_agent`) LIKE '%iphone%'
    OR lower(`user_agent`) LIKE '%ipod%'
    OR lower(`user_agent`) LIKE '%android%'
    OR lower(`user_agent`) LIKE '%blackberry%'
    OR lower(`user_agent`) LIKE '%opera mini%'
    OR lower(`user_agent`) LIKE '%iemobile%'
    OR lower(`user_agent`) LIKE '%windows phone%'
    THEN 'mobile'
  ELSE 'desktop'
END;--> statement-breakpoint

ALTER TABLE `page_views` DROP COLUMN `user_agent`;--> statement-breakpoint

CREATE INDEX `page_views_visitor_idx` ON `page_views` (`visitor`);--> statement-breakpoint

CREATE TABLE `page_view_daily` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`path` text NOT NULL,
	`referrer` text,
	`country` text,
	`device` text,
	`views` integer NOT NULL
);--> statement-breakpoint

CREATE INDEX `page_view_daily_date_idx` ON `page_view_daily` (`date`);--> statement-breakpoint

CREATE TABLE `page_view_daily_visitors` (
	`date` text PRIMARY KEY NOT NULL,
	`visitors` integer NOT NULL
);
