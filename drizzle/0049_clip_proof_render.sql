-- A quick, throwaway render, kept apart from the real one.
--
-- Arranging a clip means judging where things sit, and judging that means
-- watching it — but a full render is minutes of encoding at a quality nobody is
-- looking at yet. A proof is the same edit at half the size with the expensive
-- filters off: measured at roughly a twentieth of the time.
--
-- Deliberately not `output_media_id`. Everything downstream — the post sheet,
-- the preview link, review, publishing — reads that column and every one of
-- them must keep meaning the finished thing. A proof drives the editor's own
-- player and its contact sheet, and nothing else.
ALTER TABLE `clip_projects` ADD `proof_media_id` integer;
--> statement-breakpoint
-- What the proof was made from, so the "changed since" marker works while
-- you're still working. Separate from `render_fingerprint` so a fresh proof
-- can't make a stale full render look current.
ALTER TABLE `clip_projects` ADD `proof_fingerprint` text;
--> statement-breakpoint
-- Which kind of render a job is. Read when it finishes, to decide which column
-- the result lands in.
ALTER TABLE `render_jobs` ADD `proof` integer DEFAULT false;
