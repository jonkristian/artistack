ALTER TABLE `clip_projects` ADD `publish_alert_sent_at` integer;--> statement-breakpoint
ALTER TABLE `settings` ADD `clip_expected_platforms` integer DEFAULT 0;