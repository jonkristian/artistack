import type { ClipRenderConfig, ClipAudioTrack, TimedCaption } from './types';

/**
 * Everything a render is made of, and nothing else.
 *
 * Deliberately not the project's `updatedAt`: renaming a clip, retagging it or
 * rewriting the caption that gets posted with it all touch that column and none
 * of them change a single frame. A staleness marker driven by the timestamp
 * would cry wolf on half the edits anyone makes, and a marker that is usually
 * wrong is one people learn to ignore.
 */
export interface RenderState {
  config: ClipRenderConfig;
  captions: TimedCaption[];
  sources: {
    mediaId: number;
    position: number | null;
    trimStart: number | null;
    trimEnd: number | null;
    muted: boolean | null;
    watermark: boolean | null;
    rotation: number | null;
    fadeIn: boolean | null;
    fadeOut: boolean | null;
  }[];
  audio: Omit<ClipAudioTrack, 'id'>[];
  /**
   * The site's fallback graphic. Part of the render even though it lives
   * outside the clip: a clip set to "site default" renders differently after
   * someone changes what that is.
   */
  defaultGraphicMediaId: number | null;
}

/**
 * A stable string for a clip's render-relevant state.
 *
 * Compared rather than hashed — the string is a few kilobytes at worst, and
 * keeping it readable means a stale marker that misfires can be diagnosed by
 * looking at the row instead of by reasoning about a hash.
 *
 * One function, used by the renderer when it records a finished render and by
 * the editor when it asks whether that render still matches. Two
 * implementations of "what counts as a change" would disagree eventually, and
 * the disagreement would show up as a marker that never clears.
 */
export function renderFingerprint(state: RenderState): string {
  // Keys are written out in a fixed order rather than spread, so a change to
  // the shape of any of these types has to be reflected here on purpose.
  const sources = [...state.sources]
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .map((s) => [
      s.mediaId,
      s.trimStart ?? null,
      s.trimEnd ?? null,
      Boolean(s.muted),
      s.watermark ?? null,
      s.rotation ?? 0,
      Boolean(s.fadeIn),
      Boolean(s.fadeOut)
    ]);

  const audio = [...state.audio]
    .sort((a, b) => a.start - b.start)
    .map((a) => [
      a.mediaId,
      a.start,
      a.end ?? null,
      a.seek,
      Boolean(a.fadeIn),
      Boolean(a.fadeOut),
      Boolean(a.duck)
    ]);

  /*
   * Everything about a caption that reaches the picture.
   *
   * `color`, `background` and `anchor` were missing, which meant recolouring a
   * caption or moving it to another height left the clip looking up to date
   * when the file no longer matched it — the quiet version of the failure this
   * whole function exists to prevent. `anchor` in particular superseded `y`
   * long ago, so the one that was listed is the one nothing writes any more.
   */
  const captions = state.captions
    .filter((c) => c.text?.trim())
    .map((c) => [
      c.start,
      c.end,
      c.text,
      Boolean(c.headline),
      c.color ?? null,
      c.background ?? null,
      c.anchor ?? null,
      c.y ?? null,
      c.effect ?? null
    ]);

  return JSON.stringify({
    config: state.config,
    captions,
    sources,
    audio,
    graphic: state.defaultGraphicMediaId
  });
}
