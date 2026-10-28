-- The quick proof render is gone.
--
-- It existed to answer "is this in the right place" before the editor could
-- show you: a half-size render with the expensive filters off, made in a few
-- seconds and thrown away. The editor plays the edit itself now — the stage
-- runs the shots against the clip's own clock and the captions, branding and
-- look are drawn over it in the browser — so the proof answered a question
-- nobody was asking any more. By the end nothing even displayed one: it was
-- minutes of ffmpeg producing a file no screen in the app pointed at.
--
-- The rows and files it made are left where they are. `role = 'proof'` is
-- still recognised by the clip sweep, and with nothing pointing at them they
-- are now orphans, so the next sweep collects them — which is the one path
-- that removes both the row and the file on disk.
ALTER TABLE `clip_projects` DROP COLUMN `proof_media_id`;
ALTER TABLE `clip_projects` DROP COLUMN `proof_fingerprint`;
ALTER TABLE `render_jobs` DROP COLUMN `proof`;
