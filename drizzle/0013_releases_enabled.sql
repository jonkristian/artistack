-- Release pages are opt-in: Artistack serves developers and designers as well
-- as musicians, and a pre-save button is meaningless to most of them.
ALTER TABLE `settings` ADD `releases_enabled` integer DEFAULT false;
