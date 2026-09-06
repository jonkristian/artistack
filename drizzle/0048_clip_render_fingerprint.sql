-- What the last successful render was made from.
--
-- So the Render button can say whether pressing it would produce anything
-- different. The alternative was comparing timestamps, but `updated_at` moves
-- when a clip is renamed or retagged — neither of which changes a frame — and a
-- staleness marker that is usually wrong is one people stop reading.
--
-- Null means never rendered, or rendered before this column existed; both show
-- no marker, which is the honest answer when nothing is known.
ALTER TABLE `clip_projects` ADD `render_fingerprint` text;
