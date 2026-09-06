-- Where a bed stops.
--
-- A track ran from its in-point to the end of the clip, which is one shape of
-- edit and not the common one: a sting under an opening line, a phrase between
-- two shots, a bed that gets out of the way before the last word. Without an
-- end, the only way to stop music early was to give it a file that ran out.
--
-- Null keeps the old behaviour — plays until the clip does — so every row
-- carried over by 0045 means exactly what it meant before this column existed.
ALTER TABLE `clip_audio` ADD `end` real;
