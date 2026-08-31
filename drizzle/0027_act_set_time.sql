-- When each act goes on.
--
-- On the join rather than on the act: a stage time is a fact about the night,
-- the same as running order. The same act plays at nine one week and six the
-- next, and `shows.time` is when the doors are — not when anyone plays.

ALTER TABLE `show_acts` ADD `set_time` text;
