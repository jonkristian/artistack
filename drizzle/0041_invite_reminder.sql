-- When the one nudge was sent.
--
-- An invitation lapses after seven days and the person it was for usually
-- hasn't ignored it — they meant to do it later and the email fell down their
-- inbox. So a week on, the invite is given a fresh token and sent once more.
--
-- Once, which is what this column is for. Null means nobody has been nudged
-- yet; a timestamp means they have, and a second reminder would be nagging
-- rather than helping.
ALTER TABLE `user_invite` ADD `reminded_at` integer;
