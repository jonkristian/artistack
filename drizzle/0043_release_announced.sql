-- When the fan list was told, so it is told exactly once.
--
-- The same shape as a clip's coverage alert: a timestamp rather than a flag,
-- because "has this gone out" and "when did it go out" are the same question
-- asked twice, and the answer is worth keeping after the fact.
--
-- Null means nobody has been mailed about this release yet. Set, and neither
-- the scheduled send nor the button will do it again — a second announcement
-- of the same record is the fastest way to lose a list.
ALTER TABLE `releases` ADD `announced_at` integer;
