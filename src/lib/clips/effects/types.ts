/**
 * What a caption effect is, and the two ways it has to be able to describe
 * itself.
 *
 * Captions are drawn twice in this codebase and always have been: libass burns
 * them into the file, and the editor's overlay draws them over the video
 * element so a change to the words costs nothing instead of costing a render.
 * Every property a caption has — its colour, its panel, its height — is
 * therefore answered by one function that both callers ask, which is why
 * `captionColor` and `captionBackdrop` exist rather than two sets of rules.
 *
 * An effect is the same bargain, with more moving parts: it has to say what it
 * is in ASS override tags and again in CSS, and the two have to agree. Putting
 * both on one object is what keeps them agreeing — you cannot add the render
 * half and forget the preview half, because they are fields of the same thing.
 *
 * The asymmetry between them is real and worth knowing. ASS animates itself:
 * you hand libass `\t(0,220,\fscx100)` once and it interpolates every frame.
 * CSS here does not, because the preview is scrubbed rather than played — the
 * overlay is handed a time and draws that instant. So `ass` is asked once and
 * describes the whole life of the caption, while `css` is asked per frame and
 * describes one moment of it. Both take the same parameters, so the shape of
 * the animation is still stated once; only the way it is delivered differs.
 */
import type { AppliedEffect } from '../types';

export type EffectParamValue = number | string | boolean;
export type EffectParams = Record<string, EffectParamValue>;

/**
 * One dial on an effect.
 *
 * Declared rather than built, so the editor can draw the controls for an effect
 * it has never heard of. This is the whole reason a new effect is one file: if
 * the dials were hand-written into a dialog, every effect would also be a UI
 * change, and the ones nobody got round to would ship without their controls.
 */
export interface EffectParam {
  key: string;
  label: string;
  type: 'number' | 'color' | 'toggle';
  default: EffectParamValue;
  min?: number;
  max?: number;
  step?: number;
  /** Units or a word of explanation, shown beside the control. */
  hint?: string;
}

/** What the effect gets told about the caption it is dressing. */
export interface CaptionEffectContext {
  params: EffectParams;
  /** How long the caption is on screen, in seconds. */
  duration: number;
  /** The frame being drawn into. The preview passes the nominal one. */
  width: number;
  height: number;
  /**
   * Where the caption is anchored, in render pixels down from the top.
   *
   * Only anything that moves needs it. ASS has no relative move — `\move`
   * takes absolute coordinates — so an effect that slides the words has to be
   * told where they were going to be. Everything else can ignore it, and the
   * placement stays `buildAss`'s business rather than becoming each effect's.
   */
  y: number;
  /** The colour the caption resolved to, for effects that tint copies of it. */
  color: string;
  /** The panel behind it, or null. An effect over a panel has less to fight. */
  backdrop: string | null;
  /**
   * Something stable to seed randomness from.
   *
   * Anything that jitters has to jitter the same way every time it is asked, or
   * the preview and the render disagree and — worse — two renders of one clip
   * differ. Effects derive their noise from this rather than from `Math.random`.
   */
  seed: number;
}

/**
 * One extra drawn copy of the caption, under the caption itself.
 *
 * Splits and ghosts are several copies of one phrase rather than one phrase
 * with a property, and ASS has no tag for "and again, eight pixels left" — so
 * they are extra Dialogue lines. `from`/`to` cut a copy into slices, which is
 * how anything that moves continuously is done: `\t` interpolates once between
 * two values and cannot loop, so a jitter is a run of short lines.
 */
export interface CaptionCopy {
  /** ASS layer. Higher draws on top; the caption's own line sits above these. */
  layer: number;
  /** Override tags for this copy, e.g. `\\bord0\\1c&H3B3BFF&`. */
  tags: string;
  /** Sideways nudge in render pixels. Negative is left. */
  dx?: number;
  /** Seconds from the caption's start. The whole caption if left out. */
  from?: number;
  to?: number;
}

/** How the effect draws in the finished file. */
export interface CaptionAss {
  /** Override tags for the caption's own line. */
  tags?: string;
  copies?: CaptionCopy[];
  /**
   * Which ASS layer the caption's own line goes on. Above every copy by
   * default, which is what "copies underneath" means.
   *
   * An effect sets it when the caption has a panel behind it, because the panel
   * is part of the same draw as the words — there is no way to put one copy
   * behind the box and another in front of it. A copy underneath a solid panel
   * is a copy nobody can see, so with a backdrop the copies have to go over the
   * top instead, which means saying so here.
   */
  layer?: number;
}

/** How the browser fakes it, at one instant. */
export interface CaptionCss {
  /** Applied to the caption's own element. */
  style?: string;
  /**
   * Copies drawn in the same place with the same words, underneath the caption
   * — or over it, for the same reason the ASS side has a layer: a copy behind a
   * panel is a copy nobody sees.
   */
  copies?: { style: string; over?: boolean }[];
}

export interface CaptionEffect {
  id: string;
  label: string;
  /** One line, shown under the name where the effect is picked. */
  description: string;
  params?: EffectParam[];
  ass(ctx: CaptionEffectContext): CaptionAss;
  /** `elapsed` is seconds since the caption appeared. */
  css(ctx: CaptionEffectContext & { elapsed: number }): CaptionCss;
}

/**
 * The part of a look the browser can't say in CSS functions alone.
 *
 * Described rather than written. The effect says *what* — this curve, this
 * offset, this much softness — and one component knows how to turn that into
 * SVG primitives. An effect emitting markup would mean every effect knowing
 * about filter regions and primitive units, and a string of SVG has to be
 * inserted with `{@html}`, which does not reliably parse into an SVG namespace
 * anyway.
 *
 * Everything here is a fraction of the frame rather than a pixel count, for the
 * same reason the caption overlay measures in `cqw`: the preview is a third the
 * size of the render, and a three-pixel offset is proportionally ten times
 * bigger there. Rendered with `primitiveUnits="objectBoundingBox"`, so the
 * browser does the scaling and nothing has to measure the element.
 */
export interface PictureSvg {
  /**
   * Per-channel transfer curves as control points from 0 to 1.
   *
   * The exact counterpart of ffmpeg's `curves`: SVG's `feComponentTransfer`
   * with `type="table"` interpolates between the values it is given, which is
   * the same piecewise-linear ramp from the same numbers. This is the one part
   * of a look the browser gets exactly right rather than approximately.
   */
  curves?: { r?: number[]; g?: number[]; b?: number[] };
  /** Sideways channel offsets, as fractions of the frame's width. */
  split?: { r?: number; g?: number; b?: number };
  /** Softness, as a fraction of the frame's width. */
  blur?: number;
}

/**
 * Something painted over the picture rather than done to it.
 *
 * Scan lines are the case that needs this: they are not a filter at all but a
 * pattern laid on top, and CSS draws one exactly with a repeating gradient
 * where an SVG filter would have to invent it per pixel.
 *
 * Deliberately not measured against the frame, unlike everything else here. A
 * line every four pixels of a 1920-tall render is every two thirds of a pixel
 * in a 340-tall preview, which is not a finer texture — it is a grey wash, or
 * a moiré, depending on the browser. So an overlay states what it looks like at
 * the size it is being drawn, and the preview says "this has scan lines"
 * without claiming to say how many.
 */
export interface PictureOverlay {
  /** A CSS background value — a gradient, usually. */
  background?: string;
  /** How it combines with the picture underneath. */
  blend?: string;
  opacity?: number;
  /** Which part of the picture it covers, as a CSS `inset`. All of it if absent. */
  inset?: string;
  /**
   * A filter applied to whatever shows through, for a band that damages the
   * picture rather than tinting it — the head-switching strip along the bottom
   * edge is a stretch of ruined signal, not a mark drawn on a good one.
   */
  backdrop?: string;
}

/** How a look is drawn over the video in the editor, at one instant. */
export interface PictureCss {
  /** Unitless CSS filter functions — saturate, contrast, brightness. */
  filter?: string;
  /**
   * A transform on the picture itself — `scale(1.1) translate(-2%, 0)`.
   *
   * Separate from `filter` because it moves the frame rather than recolouring
   * it, and because the two compose independently: a push-in under a grade is
   * one of each, not one string doing both.
   */
  transform?: string;
  svg?: PictureSvg;
  overlay?: PictureOverlay[];
}

/**
 * What a fragment needs to wire itself into the footage chain.
 *
 * Everything a linear filter gets, plus the two labels it sits between. The
 * fragment reads from `input`, must leave its result on `output`, and may
 * invent any intermediate labels it likes so long as they carry `id`, which is
 * unique per placement — two of the same effect on one clip would otherwise
 * write to the same names and one would quietly consume the other's frames.
 */
export interface PictureGraphContext extends PictureEffectContext {
  input: string;
  output: string;
  /** Unique per placement, for naming intermediate labels. */
  id: string;
  /*
   * Nothing about timing here, deliberately.
   *
   * A fragment is only ever built inside a region the resolver has already
   * gated, so it runs when it runs and has nothing to decide. Gating used to be
   * handed down for each filter to apply, which broke the moment a look used a
   * filter with no timeline support — `scale` and `crop` reject `enable` and
   * take the whole render down with them.
   */
}

/** What a picture effect gets told about the frame it is working on. */
export interface PictureEffectContext {
  params: EffectParams;
  /** The finished clip's dimensions, for anything measured in pixels. */
  width: number;
  height: number;
  fps: number;
  /**
   * When this placement runs, in clip seconds.
   *
   * Most effects never read it: a grade is the same in every frame it touches,
   * and `enable=` already decides which frames those are. Anything that *moves*
   * needs more than being switched on — it has to know how far through itself
   * it is, and `t` alone cannot say, because `t` is the clip's clock rather
   * than the effect's.
   *
   * Always resolved, never null: an effect placed with no window covers the
   * whole clip, so the caller fills in `0` and the clip's length rather than
   * leaving every effect to work out what absent means.
   */
  window: { start: number; end: number };
}

/**
 * An effect on the footage rather than on the words.
 *
 * One renderer instead of the caption family's two, because there is no browser
 * half to keep in step: the overlay draws over the video element and never
 * touches the picture underneath. What stands in for a preview is the still
 * that `previewFilters` already renders through ffmpeg — the same fragments,
 * the same filters, so a look cannot be one thing in the tile and another in
 * the file. An effect that needs motion to mean anything says so by leaving
 * `stillSafe` off, and is simply left out of the still rather than misrepresented
 * by it.
 *
 * Fragments are linear and comma-joined: the footage chain runs between one
 * input and one output, so a filter needing `split` and `overlay` — a
 * head-switching band, a scratch plate — cannot be written as one of these. It
 * would need the chain to become a graph, which is a bigger change than any one
 * effect should make.
 */
export interface PictureEffect {
  id: string;
  label: string;
  description: string;
  params?: EffectParam[];
  /**
   * Whether it is a moment or a stretch.
   *
   * A tape look is something footage is *in* for as long as you want; a signal
   * dropping out is something that happens and is over. Dragged onto the strip
   * they want different shapes — one a bar you stretch across a chorus, the
   * other a flash you put on a beat — and the difference decides how long a new
   * block is and how the strip draws it. A burst stretched to two seconds is
   * not a longer fault, it is a broken tape.
   *
   * `span` when unsaid, because most looks are.
   */
  shape?: 'burst' | 'span';
  /**
   * The effect times itself, so no `enable` gate is put around it.
   *
   * `enable` switches a filter off outside its window, which is right for
   * everything that is a *state* — a grade, a tape look, a tear. It is wrong
   * for anything that is a *journey*: gated, a move snapped back to where it
   * started the instant its window ended, because the filter simply stopped
   * being applied. What you saw was a pan across a chorus followed by a jump.
   *
   * An effect claiming this reads `window` itself and clamps — so before its
   * start it draws the opening framing, after its end it holds the closing
   * one, and there is no edge to see.
   */
  selfTimed?: boolean;
  /**
   * How long a new block of it should be, in seconds.
   *
   * The effect knows this and the timeline does not: a tear lasts about as long
   * as a frame or two, a grade lasts as long as the shot. Absent means the
   * strip decides from the zoom, which is the right answer for a span and a
   * useless one for a burst.
   */
  seconds?: number;
  /** Filters in the order they should run, joined into the footage chain. */
  filter(ctx: PictureEffectContext): string[];
  /**
   * The part of a look that isn't a chain at all.
   *
   * Some artefacts are not something done to every pixel but something done to
   * a *piece* of the picture and put back: the head-switching tear along the
   * bottom edge, a band of tracking noise drifting up the frame. Those take a
   * copy, ruin it, and composite it over the original — which needs `split` and
   * `overlay`, and so cannot be one comma in a linear run.
   *
   * This was declared impossible here, on the grounds that the footage chain
   * runs between one input and one output. It still does; a fragment is simply
   * told what those labels are and left free to branch in between.
   *
   * Runs after `filter`, so a fragment sees the graded picture and its damage
   * is not then graded in turn.
   */
  graph?(ctx: PictureGraphContext): string[];
  /**
   * The same look, drawn over the video element instead of into the file.
   *
   * The picture family had one renderer where the caption family has two, on
   * the grounds that there was no browser half to keep in step — the overlay
   * draws over the video and never touches the picture underneath. That was
   * true of the overlay and not of the video itself, which takes a CSS filter
   * like any other element. So both families have the same shape after all:
   * what goes in the file and what the editor shows, on one object, where
   * neither can be added without the other.
   *
   * A likeness, not a copy — the same trade the caption overlay already makes.
   * Grade, curves, softness and the channel split carry over; grain does not,
   * and an effect simply leaves it out rather than faking it badly.
   *
   * Asked per frame, because the preview is scrubbed rather than played, so an
   * effect with a rhythm answers for the moment being drawn.
   */
  css?(ctx: PictureEffectContext & { at: number; windowed: boolean }): PictureCss;
  /**
   * When the effect should be doing anything, as an ffmpeg expression on `t`.
   *
   * Separate from `filter` rather than written into it, so that *when* and
   * *what* can be combined by whoever knows both. An effect knows its own
   * rhythm — a dropout tears for a tenth of a second every few seconds — and
   * the timeline knows the window it was placed in. Neither can write the other
   * one's half, and ffmpeg takes only one `enable` per filter, so an effect
   * that spelled out its own would be one that could never be placed.
   *
   * Absent means whenever it is on screen.
   */
  when?(ctx: PictureEffectContext): string;
  /** Whether one frame of it still tells you what it does. */
  stillSafe?: boolean;
}

/**
 * A related set, shipped together.
 *
 * The unit of "add more in the future": one file exporting one pack, named in
 * the index. Nothing else in the codebase learns about it — the renderer, the
 * preview and the editor all read the registry, so a pack arrives in all three
 * at once or in none of them.
 */
export interface EffectPack {
  id: string;
  label: string;
  /** Effects on the words. */
  captions?: CaptionEffect[];
  /** Effects on the picture. */
  picture?: PictureEffect[];
}

/** An effect's dials, with anything unsaid filled in from its declaration. */
export function effectParams(
  effect: { params?: EffectParam[] },
  applied?: AppliedEffect | null
): EffectParams {
  const params: EffectParams = {};
  for (const param of effect.params ?? []) params[param.key] = param.default;
  for (const [key, value] of Object.entries(applied?.params ?? {})) {
    if (value != null) params[key] = value;
  }
  return params;
}

/** 0 at the start of the window, 1 at its end, eased so it lands rather than stops. */
export function easeOut(elapsed: number, seconds: number): number {
  if (seconds <= 0) return 1;
  const t = Math.min(1, Math.max(0, elapsed / seconds));
  return 1 - (1 - t) ** 3;
}

/** A plain 0..1 ramp, for opacity, where easing reads as a stutter. */
export function ramp(elapsed: number, seconds: number): number {
  if (seconds <= 0) return 1;
  return Math.min(1, Math.max(0, elapsed / seconds));
}

/**
 * Repeatable noise.
 *
 * A tiny LCG rather than `Math.random`, because a render has to come out the
 * same twice and the preview has to show what the render will do.
 */
export function noise(seed: number, step: number): number {
  const x = Math.sin(seed * 12.9898 + step * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/** #rrggbb to ASS's `&HBBGGRR&`, the inline spelling `\1c` and friends take. */
export function assInlineColor(hex: string): string {
  const h = hex.replace(/^#|^0x/i, '').padEnd(6, '0');
  return `&H${h.slice(4, 6)}${h.slice(2, 4)}${h.slice(0, 2)}&`.toUpperCase();
}
