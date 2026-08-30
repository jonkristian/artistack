-- 0020 converted the boolean columns to JSON booleans but missed this one, so
-- it landed as 1 rather than true. The site key then failed its schema and fell
-- back to defaults — where setupCompleted is false, which put the first-run
-- setup card back on a site that was already set up.
--
-- Coerced rather than rewritten so a value of 0 stays false.
UPDATE `settings`
SET value = json_set(
      value,
      '$.faviconGenerated',
      json(CASE WHEN json_extract(value, '$.faviconGenerated') THEN 'true' ELSE 'false' END)
    ),
    updated_at = CAST(strftime('%s','now') AS INTEGER)
WHERE key = 'site'
  AND json_type(value, '$.faviconGenerated') NOT IN ('true','false');
