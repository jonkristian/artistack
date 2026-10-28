-- `headline` becomes the size it always meant.
--
-- It was the aA switch: a caption drawn at `width / headlineSizeDivisor`
-- instead of `width / captionSizeDivisor`. The switch is gone — captions carry
-- a real pixel size now, chosen from a menu — so the flag is a thing nothing
-- can set, and one dial exists only to serve it. Each caption that still has
-- the flag gets the size written into its own markup, which is what the menu
-- would have stored, and the flag goes. Captions without it are passed through
-- untouched.
UPDATE `clip_projects`
SET `captions` = (
  SELECT json_group_array(
    CASE
      -- Already carries a size of its own, so the flag was only deciding what
      -- the menu called "Normal". Nothing to write down; just drop the flag.
      WHEN json_extract(value, '$.headline') = 1
           AND json_extract(value, '$.text') NOT LIKE '%font-size%' THEN
        json_remove(
          json_set(
            value,
            '$.text',
            '<span style="font-size: '
              || CAST(CAST(ROUND(
                   CASE json_extract(`clip_projects`.`config`, '$.aspect')
                     WHEN '16:9' THEN 1920.0
                     ELSE 1080.0
                   END
                   / COALESCE(
                       (SELECT json_extract(`value`, '$.advanced.headlineSizeDivisor')
                          FROM `settings` WHERE `key` = 'clipDefaults'),
                       12.0
                     )
                 ) AS INTEGER) AS TEXT)
              || 'px">' || json_extract(value, '$.text') || '</span>'
          ),
          '$.headline'
        )
      ELSE json_remove(value, '$.headline')
    END
  )
  FROM json_each(`clip_projects`.`captions`)
)
WHERE EXISTS (
  SELECT 1 FROM json_each(`clip_projects`.`captions`)
  WHERE json_extract(value, '$.headline') IS NOT NULL
);
