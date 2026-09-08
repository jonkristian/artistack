/**
 * How much timeline one second of clip gets.
 *
 * Fitting a whole clip to the column was the first attempt and it collapsed: a
 * caption a second long came out a few pixels wide, with nothing to grab and
 * nothing to read. A fixed rate means a second is the same distance in every
 * clip, the blocks keep a workable size, and long clips scroll — which is what
 * every editor that has solved this does.
 */
export const STRIP_PX_PER_SECOND = 170;
