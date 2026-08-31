-- When the doors open, as distinct from when anyone plays.
--
-- `time` was being rendered as "doors" on the show page, but it's the start of
-- the show — the first act on stage. Those are different, often by half an
-- hour, and the one people need in order to turn up is doors.
--
-- Nullable: plenty of gigs never publish a doors time, and inventing one is
-- worse than leaving it out.

ALTER TABLE `shows` ADD `doors_time` text;
