-- Body copy for a show and for a release.
--
-- Both pages had a picture, some facts and a row of links, and nowhere to say
-- anything. A gig with a story behind it — a record launch, a last night, who's
-- opening and why — had to put it in the title or leave it out.
--
-- On a release this is deliberately not `pages.description`. That one is the
-- meta description: plain text, cut short around 160 characters by a search
-- result, and printed verbatim if it ever contained markup. This is the copy
-- people read on the page, written in the rich editor and rendered as markup —
-- two different jobs that were being asked of one field.
ALTER TABLE `shows` ADD `description` text;--> statement-breakpoint
ALTER TABLE `releases` ADD `body` text;
