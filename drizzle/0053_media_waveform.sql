-- A picture of the song, so a bed can be lined up by eye instead of by ear.
--
-- One PNG per audio file, generated once and cached like the preview rendition
-- beside it. Null until it's been made, and null forever for anything that
-- isn't audio; the timeline simply draws nothing.
ALTER TABLE `media` ADD `waveform_url` text;
