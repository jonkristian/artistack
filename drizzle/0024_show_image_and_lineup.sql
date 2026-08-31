-- A show gets a poster, and its line-up becomes a list rather than a sentence.
--
-- The line-up was free text, so it was whatever each entry happened to be typed
-- as: this site had "A - B - C" on one show and "A, B, C" on two others. Nothing
-- could order it, render a band per row, or be rearranged.

ALTER TABLE `shows` ADD `image_url` text;--> statement-breakpoint

-- Split on both separators this site actually used, trimming each name.
--
-- A guess, unavoidably: a band with a comma in its name splits in two, and
-- there's no way to tell that apart from a separator. Rows are few and the new
-- editor makes it obvious, so a wrong split is visible and one drag to fix —
-- which is better than leaving every line-up as a single unusable row.
--
-- `seq` is carried through the recursion because json_group_array has no
-- ordering of its own, and a line-up is billing order: sorted alphabetically it
-- would say something different from what was typed.
WITH RECURSIVE split(id, seq, rest, part) AS (
  SELECT id, 0, replace(replace(lineup, ' - ', char(31)), ',', char(31)) || char(31), ''
  FROM `shows` WHERE lineup IS NOT NULL AND trim(lineup) <> ''
  UNION ALL
  SELECT id, seq + 1,
         substr(rest, instr(rest, char(31)) + 1),
         trim(substr(rest, 1, instr(rest, char(31)) - 1))
  FROM split WHERE rest <> ''
)
UPDATE `shows` SET `lineup` = COALESCE(
  (SELECT json_group_array(part)
     FROM (SELECT part FROM split WHERE split.id = `shows`.id AND part <> '' ORDER BY seq)),
  '[]'
);
