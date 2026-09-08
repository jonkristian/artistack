-- Corrects the placement backfill for clips that don't play at normal speed.
--
-- 0051 laid each placement after the one before it by summing trim windows and
-- file durations — which is how long the footage is, not how long it plays for.
-- A clip at double speed occupies half the timeline, so every placement after
-- the first was left sitting in a gap of its own making.
--
-- Harmless where speed is 1, which is every clip that exists today; this is for
-- the ones that don't, and for the fact that a migration nobody has run yet is
-- the cheapest place to be wrong.
UPDATE `clip_sources` SET `start` = COALESCE((
  SELECT SUM(
    CASE
      WHEN prev.`trim_start` IS NOT NULL AND prev.`trim_end` IS NOT NULL
        THEN MAX(0, prev.`trim_end` - prev.`trim_start`)
      ELSE COALESCE((SELECT m.`duration_ms` FROM `media` m WHERE m.`id` = prev.`media_id`), 0) / 1000.0
    END
    / COALESCE(NULLIF((
      SELECT json_extract(p.`config`, '$.speed') FROM `clip_projects` p
      WHERE p.`id` = `clip_sources`.`project_id`
    ), 0), 1)
  )
  FROM `clip_sources` prev
  WHERE prev.`project_id` = `clip_sources`.`project_id`
    AND prev.`position` < `clip_sources`.`position`
), 0);
