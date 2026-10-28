-- A clip keeps its disagreements, not a copy of the defaults.
--
-- `config` was written as `{...DEFAULT_CLIP_CONFIG, ...changes}`, and the
-- Advanced panel's reset button wrote every dial out by name. The result: one
-- clip here held forty-two advanced values, every one byte-identical to the
-- constant in code. Storing them changed nothing except to pin that clip to
-- the engine's settings as of the day the button was pressed — no later
-- improvement to a default could reach it, and nothing said so.
--
-- Writes keep only what differs now. This clears what was already written,
-- and only where there is genuinely nothing to keep: the defaults are inlined
-- below as they stand today, and a clip's `advanced` block is removed only if
-- every single value in it matches. A block holding one real choice is left
-- entirely alone — the next ordinary write will trim the rest of it.
-- First, two dials that are no longer settings at all: `headlineSizeDivisor`
-- went with the aA switch, and `captionFont` moved onto the clip's own config
-- where the rest of a caption's house style lives. A key the defaults have
-- never heard of counts as a disagreement below — rightly, since it is usually
-- somebody's choice — so these have to go before that test, or they would keep
-- a block of pure defaults alive on their own.
UPDATE `clip_projects`
SET `config` = json_remove(`config`, '$.advanced.headlineSizeDivisor', '$.advanced.captionFont')
WHERE json_extract(`config`, '$.advanced') IS NOT NULL;

UPDATE `clip_projects`
SET `config` = json_remove(`config`, '$.advanced')
WHERE json_extract(`config`, '$.advanced') IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM json_each(json_extract(`clip_projects`.`config`, '$.advanced')) AS dial
    WHERE json_extract('{"fps":30,"crf":23,"maxrateMbps":10,"audioBitrateKbps":128,"preset":"fast","loudnormTarget":-14,"loudnormTruePeak":-1.5,"loudnormRange":11,"loudnormFloor":-32,"bedFadeSeconds":1.5,"musicBedVolume":0.25,"introPercent":0.18,"introMinSeconds":1.2,"introMaxSeconds":2.5,"introFallbackSeconds":1.8,"outroSeconds":2,"outroOverlapSeconds":0.6,"cardBackground":"#0d0d0d","logoWidthPercent":60,"watermarkWidthPercent":22,"watermarkX":32,"watermarkY":40,"captionSizeDivisor":18,"captionBackdropPercent":100,"captionMarginX":80,"captionTopPercent":72,"captionMiddlePercent":38.2,"captionBottomPercent":18,"fontFamily":"","blurStrength":24,"grainStrength":16,"zoomRate":0.0008,"zoomMax":1.1,"xfadeSeconds":0.4,"edgeFillPixels":10,"clipFadeSeconds":0.5,"videoFadeInSeconds":0.4,"videoFadeOutSeconds":0.4,"audioFadeInSeconds":0.4,"audioFadeOutSeconds":0.4,"coverLumaThreshold":24}', '$.' || dial.key) IS NULL
       OR json_extract('{"fps":30,"crf":23,"maxrateMbps":10,"audioBitrateKbps":128,"preset":"fast","loudnormTarget":-14,"loudnormTruePeak":-1.5,"loudnormRange":11,"loudnormFloor":-32,"bedFadeSeconds":1.5,"musicBedVolume":0.25,"introPercent":0.18,"introMinSeconds":1.2,"introMaxSeconds":2.5,"introFallbackSeconds":1.8,"outroSeconds":2,"outroOverlapSeconds":0.6,"cardBackground":"#0d0d0d","logoWidthPercent":60,"watermarkWidthPercent":22,"watermarkX":32,"watermarkY":40,"captionSizeDivisor":18,"captionBackdropPercent":100,"captionMarginX":80,"captionTopPercent":72,"captionMiddlePercent":38.2,"captionBottomPercent":18,"fontFamily":"","blurStrength":24,"grainStrength":16,"zoomRate":0.0008,"zoomMax":1.1,"xfadeSeconds":0.4,"edgeFillPixels":10,"clipFadeSeconds":0.5,"videoFadeInSeconds":0.4,"videoFadeOutSeconds":0.4,"audioFadeInSeconds":0.4,"audioFadeOutSeconds":0.4,"coverLumaThreshold":24}', '$.' || dial.key) <> dial.value
  );
