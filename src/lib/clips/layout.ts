import type { ClipAdvancedConfig, ClipRenderConfig } from './types';
import { DEFAULT_ADVANCED_CONFIG } from './types';

/**
 * Where each source clip sits on the timeline, worked out from the edit itself.
 *
 * The timeline used to be drawn on a contact sheet of the last render, which
 * meant it couldn't exist until something had been rendered, showed the
 * previous arrangement rather than the current one, and had the last set of
 * captions burned into the pictures behind the caption lane.
 *
 * Deriving the layout instead makes it true as you work. It also makes the
 * arithmetic checkable, which the sheet's never was: a placement begins where
 * it says it does and lasts as long as its trim window — or the whole file when
 * it hasn't got one — divided by the speed. The outro adds its own length less
 * its overlap. The intro adds nothing; it rides over whatever opens the clip.
 */
export interface LayoutSource {
  id: number;
  mediaId: number;
  /** Where it begins on the timeline. */
  start: number;
  /** Which row, and so what covers what where two overlap. */
  lane: number;
  trimStart: number | null;
  trimEnd: number | null;
  /** The file's own length in seconds, for anything untrimmed. */
  length: number;
}

export interface LayoutBlock {
  /** The `clip_sources` row this came from. */
  id: number;
  mediaId: number;
  start: number;
  end: number;
  lane: number;
}

export interface ClipLayout {
  blocks: LayoutBlock[];
  /** How long the clip runs, including the outro. */
  duration: number;
}

/** How long one source plays for, after its trim and the clip's speed. */
function lengthOf(source: LayoutSource, speed: number): number {
  const trimmed =
    source.trimStart != null && source.trimEnd != null
      ? Math.max(0, source.trimEnd - source.trimStart)
      : source.length;

  return trimmed / (speed || 1);
}

export function clipLayout(
  sources: LayoutSource[],
  config: ClipRenderConfig,
  advanced?: Partial<ClipAdvancedConfig>,
  /**
   * The furthest end of anything else on the timeline — a caption, a bed.
   *
   * The clip is as long as the longest thing on it, whatever kind of thing that
   * is. Measuring only the footage meant a bed running past the last shot was
   * marked as not rendering, and then wasn't: which end of a timeline you are
   * looking at shouldn't depend on what is sitting there.
   *
   * A bed with no end of its own doesn't count. "Until the clip does" cannot
   * also decide when that is.
   */
  otherwiseUntil = 0
): ClipLayout {
  const adv = { ...DEFAULT_ADVANCED_CONFIG, ...(advanced ?? {}) };

  const blocks: LayoutBlock[] = sources.map((source) => ({
    id: source.id,
    mediaId: source.mediaId,
    lane: source.lane,
    start: source.start,
    end: source.start + lengthOf(source, config.speed)
  }));

  // The furthest end, not the sum of the lengths: clips can sit anywhere now,
  // including over each other and with nothing between them.
  const body = blocks.reduce((furthest, block) => Math.max(furthest, block.end), otherwiseUntil);

  // The outro dissolves out of the end of the body, so it only adds whatever
  // isn't already overlapping it.
  const outro = config.outro ? Math.max(0, adv.outroSeconds - adv.outroOverlapSeconds) : 0;

  return { blocks, duration: Math.max(0.1, body + outro) };
}
