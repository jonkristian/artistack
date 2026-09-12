/**
 * Every effect there is, and the one question worth asking about a caption.
 *
 * Adding one is adding a file and a line to `PACKS`. Nothing else in the
 * codebase names an effect: the renderer asks this registry what to write, the
 * editor's overlay asks it what to draw, and the dialog builds its controls
 * from the parameters the effect declares. That is the point of the shape — an
 * effect that only half-arrives, working in the file but not in the preview or
 * present in neither but listed in the menu, isn't possible to write.
 */
import { basics } from './basics';
import { tvDamagePack } from './tv-damage';
import { gradesPack } from './grades';
import { vhsPack } from './vhs';
import { effectParams } from './types';
import { DEFAULT_CAPTION_EFFECT } from '../types';
import type { AppliedEffect, PlacedEffect, TimedCaption } from '../types';
import type {
  CaptionEffect,
  EffectPack,
  PictureEffect,
  PictureEffectContext,
  PictureOverlay,
  PictureSvg
} from './types';

export * from './types';

export const PACKS: EffectPack[] = [basics, gradesPack, tvDamagePack, vhsPack];

/** Effects on the words. */
export const EFFECTS: CaptionEffect[] = PACKS.flatMap((pack) => pack.captions ?? []);

/** Effects on the picture. */
export const PICTURE_EFFECTS: PictureEffect[] = PACKS.flatMap((pack) => pack.picture ?? []);

/**
 * The effect by that name, or the plain fade.
 *
 * Never null, so nothing downstream has to carry a branch for "no effect" —
 * fade *is* the absence of one, and it renders what captions rendered before
 * any of this existed. An unrecognised id lands here too, which is what makes a
 * pack safe to remove.
 */
export function effectById(id: string | undefined | null): CaptionEffect {
  return (
    EFFECTS.find((effect) => effect.id === id) ??
    EFFECTS.find((effect) => effect.id === DEFAULT_CAPTION_EFFECT) ??
    EFFECTS[0]
  );
}

/**
 * What effect a caption is actually using, and with what dials.
 *
 * One answer for the render and the overlay, alongside `captionColor` and
 * `captionBackdrop` — the caption's own if it has one, otherwise the clip's,
 * otherwise a fade.
 */
export function captionEffectOf(
  caption: Pick<TimedCaption, 'effect'>,
  config: { captionEffect?: AppliedEffect | null }
): { effect: CaptionEffect; params: Record<string, number | string | boolean> } {
  const applied = caption.effect ?? config.captionEffect;
  const effect = effectById(applied?.id);
  return { effect, params: effectParams(effect, applied) };
}

/**
 * The picture effect by that name, or nothing.
 *
 * Null rather than a fallback, unlike the caption side: there, an unrecognised
 * name lands on the plain fade because a caption still has to be drawn. Footage
 * with no effect on it is just footage, so the honest answer to a pack that has
 * been removed is to leave the picture alone.
 */
export function pictureEffectById(id: string | undefined | null): PictureEffect | null {
  return PICTURE_EFFECTS.find((effect) => effect.id === id) ?? null;
}

/**
 * Every picture effect a clip carries, oldest form included.
 *
 * `pictureEffect` was a single look before effects could be placed. Folded in
 * here rather than migrated, because reading it costs three lines and a
 * migration costs a schema change to fix something no clip has had time to get
 * wrong.
 */
export function clipEffects(config: {
  effects?: PlacedEffect[];
  pictureEffect?: AppliedEffect | null;
}): PlacedEffect[] {
  if (config.effects?.length) return config.effects;
  return config.pictureEffect ? [config.pictureEffect] : [];
}

/** The one a clip-wide picker is editing: the entry with no window on it. */
export function clipWideEffect(config: {
  effects?: PlacedEffect[];
  pictureEffect?: AppliedEffect | null;
}): PlacedEffect | null {
  return clipEffects(config).find((e) => e.start == null && e.end == null) ?? null;
}

/**
 * When a placed effect is actually doing something, as one ffmpeg expression.
 *
 * Two halves meet here and nowhere else: the effect's own rhythm, which it
 * states in `when`, and the window it was dragged to, which only the timeline
 * knows. ffmpeg allows one `enable` per filter, so they have to be multiplied
 * into a single expression rather than both applied — and a dropout placed over
 * the chorus should tear on its own schedule *within* the chorus, which is what
 * multiplying two conditions means.
 *
 * Null when there is nothing to say, so an effect covering the whole clip with
 * no rhythm of its own doesn't pay for an `enable` that is always true.
 */
function gateFor(effect: PictureEffect, placed: PlacedEffect, ctx: PictureEffectContext) {
  const windowed = placed.start != null || placed.end != null;

  /*
   * A block is its own answer to "when".
   *
   * An effect's `when` is a rhythm on the clip's clock — a dropout tears for a
   * tenth of a second every few seconds — which is the right thing for a look
   * covering the whole clip and quite wrong for one dragged onto a moment.
   * Multiplying the two, which is what this did, meant a block only fired where
   * the schedule happened to coincide with it: a burst at 3.7s and 5.29s and a
   * block over 1s–3s did nothing whatsoever, in the file as well as the
   * preview. You placed it there; that is when it should happen.
   *
   * So the rhythm applies only when there is no window to override it.
   */
  if (windowed) {
    const from = (placed.start ?? 0).toFixed(2);
    const to = placed.end != null ? placed.end.toFixed(2) : '99999';
    return `between(t,${from},${to})`;
  }

  const own = effect.when?.(ctx);
  return own ? `(${own})` : null;
}

/**
 * The clip's look at one instant, for the editor to draw over the video.
 *
 * The counterpart of `pictureFilters`, asked the same question of the same
 * effects and answered from the same dials. Placement is applied here rather
 * than by the effects: an effect states its own rhythm and the timeline states
 * its window, and the two are combined by whoever knows both — the same
 * division the render makes when it multiplies the conditions into one
 * `enable`.
 *
 * Effects with no browser half are skipped rather than approximated. A look the
 * editor cannot show is better absent than wrong, and the full render is where
 * the truth is either way.
 */
export function pictureCss(
  config: { effects?: PlacedEffect[]; pictureEffect?: AppliedEffect | null },
  frame: { width: number; height: number; fps: number },
  at: number
): { filter: string; svg: PictureSvg[]; overlay: PictureOverlay[] } {
  const filters: string[] = [];
  const svg: PictureSvg[] = [];
  const overlay: PictureOverlay[] = [];

  for (const placed of clipEffects(config)) {
    const effect = pictureEffectById(placed.id);
    if (!effect?.css) continue;
    if (placed.start != null && at < placed.start) continue;
    if (placed.end != null && at >= placed.end) continue;

    /*
     * Inside its window it is simply on, matching `gateFor`: a placed effect is
     * gated by where it was put and not by any rhythm of its own. `windowed` is
     * passed through so an effect whose look depends on the distinction can ask
     * — the dropout uses it to stop consulting its own schedule.
     */
    const windowed = placed.start != null || placed.end != null;
    const drawn = effect.css({ params: effectParams(effect, placed), ...frame, at, windowed });
    if (drawn.filter) filters.push(drawn.filter);
    if (drawn.svg) svg.push(drawn.svg);
    if (drawn.overlay) overlay.push(...drawn.overlay);
  }

  return { filter: filters.join(' '), svg, overlay };
}

/**
 * The whole look as filtergraph statements, between two labels.
 *
 * Effects contribute two kinds of thing and both end up here: a run of linear
 * filters, which becomes one statement, and a fragment that branches, which
 * brings its own. They are strung together in order, each reading what the last
 * one left, so a clip carrying a grade and a head-switching tear gets the tear
 * applied to the graded picture rather than to the original.
 *
 * Labels are handed out here rather than by the effects, because only this
 * knows which step is last — and the last one has to write to the caller's
 * output rather than to a name of its own.
 *
 * Returns nothing at all when there is nothing to do, so a clip with no effects
 * adds no statements and pays for no passes.
 */
export function pictureGraph(
  config: { effects?: PlacedEffect[]; pictureEffect?: AppliedEffect | null },
  frame: { width: number; height: number; fps: number },
  input: string,
  output: string
): string[] {
  /** Each step, still unlabelled: it is given its ends once they are known. */
  const steps: ((from: string, to: string) => string[])[] = [];

  clipEffects(config).forEach((placed, index) => {
    const effect = pictureEffectById(placed.id);
    if (!effect) return;

    const ctx = { params: effectParams(effect, placed), ...frame };
    const gate = gateFor(effect, placed, ctx);
    const id = `fx${index}`;

    /** Everything the effect does, between two labels, ungated. */
    const body = (from: string, to: string): string[] => {
      const lines: string[] = [];
      let at = from;
      const filters = effect.filter(ctx);
      if (filters.length) {
        const next = effect.graph ? `[chain${id}]` : to;
        lines.push(`${at}${filters.join(',')}${next}`);
        at = next;
      }
      if (effect.graph) {
        lines.push(...effect.graph({ ...ctx, input: at, output: to, id }));
        at = to;
      }
      // An effect with neither still has to join its two ends up.
      if (at !== to) lines.push(`${at}null${to}`);
      return lines;
    };

    steps.push((from, to) => {
      if (!gate) return body(from, to);

      /*
       * Gated as a whole, not filter by filter.
       *
       * `enable` was appended to each filter in turn, which fails outright the
       * moment a look contains one that has no timeline support: `scale` and
       * `crop` refuse it — "Not yet implemented in FFmpeg, patches welcome" —
       * and the refusal takes the entire render with it, not just the effect.
       * Any look with a resolution change in it could not be placed at all.
       *
       * So the picture is split, the whole look runs on one copy, and the
       * result is composited back only during the window. It works whatever the
       * effect is made of, because the thing being switched on and off is an
       * `overlay` rather than the filters themselves — and an overlay that is
       * off passes the untouched copy straight through.
       *
       * The effect must hand back a frame the same size it was given, which
       * every look here does; `overlay` has nothing sensible to do with two
       * different sizes.
       */
      return [
        `${from}split=2[keep${id}][tap${id}]`,
        ...body(`[tap${id}]`, `[done${id}]`),
        `[keep${id}][done${id}]overlay=enable='${gate}'${to}`
      ];
    });
  });

  const statements: string[] = [];
  let from = input;
  steps.forEach((step, index) => {
    const to = index === steps.length - 1 ? output : `[look${index}]`;
    statements.push(...step(from, to));
    from = to;
  });
  return statements;
}

/** The filters a clip's effects contribute, in order. Empty for none. */
export function pictureFilters(
  config: { effects?: PlacedEffect[]; pictureEffect?: AppliedEffect | null },
  frame: { width: number; height: number; fps: number },
  options: { stillOnly?: boolean } = {}
): string[] {
  const filters: string[] = [];

  for (const placed of clipEffects(config)) {
    const effect = pictureEffectById(placed.id);
    if (!effect) continue;
    /*
     * A still shows the clip as it mostly is, so anything needing motion is
     * left out — and so is anything placed at a moment, because a look that
     * only exists for half a second is not what this clip looks like.
     */
    if (options.stillOnly && (!effect.stillSafe || placed.start != null)) continue;

    const ctx = { params: effectParams(effect, placed), ...frame };
    const gate = options.stillOnly ? null : gateFor(effect, placed, ctx);
    /*
     * Quoted, not escaped: single quotes protect the commas inside the
     * expression from the comma that separates one filter from the next.
     */
    const enable = gate ? `:enable='${gate}'` : '';
    filters.push(...effect.filter(ctx).map((filter) => `${filter}${enable}`));
  }

  return filters;
}

/**
 * Something stable to derive a twitch from.
 *
 * A render has to come out the same twice, and the preview has to show what the
 * render is going to do, so anything random is seeded from the caption itself.
 * Its start time and its words, because those are what make it this caption
 * rather than the one before — two captions saying the same thing at different
 * moments should not judder in unison.
 */
export function captionSeed(caption: Pick<TimedCaption, 'start' | 'text'>): number {
  let hash = Math.round((caption.start ?? 0) * 1000);
  const text = caption.text ?? '';
  for (let i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) % 100000;
  return hash;
}
