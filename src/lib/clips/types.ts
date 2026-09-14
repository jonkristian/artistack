/**
 * Clip studio configuration types.
 *
 * These live outside `$lib/server` because the admin UI needs the defaults at
 * runtime, and SvelteKit refuses to bundle a server module into browser code.
 * The database schema imports them from here.
 */

/**
 * One piece of music under a clip, as the editor and the renderer both see it.
 *
 * Mirrors the `clip_audio` row. Kept here beside TimedCaption because the same
 * argument applies: the admin needs the shape at runtime, and `$lib/server` is
 * not importable from browser code.
 */
export interface ClipAudioTrack {
  id: number;
  mediaId: number;
  /** Where it comes in on the clip's timeline, in seconds. */
  start: number;
  /** Where it stops. Null plays until the clip does. */
  end: number | null;
  /** Where it comes in from inside the track, in seconds. */
  seek: number;
  /**
   * Whether it fades at its own edges — against silence, or against the start
   * or end of the clip. How long a fade lasts is one advanced dial for the
   * whole clip, not a number on every track.
   *
   * Where two beds overlap they always cross into each other regardless, since
   * summing two of them at full is not a thing anyone does on purpose.
   */
  fadeIn: boolean;
  fadeOut: boolean;
  duck: boolean;
  /** Which row it sits in on the timeline. */
  lane: number;
}

/**
 * Where a caption can sit in the frame, highest first.
 *
 * Named, and only three of them, because the names are what make lining
 * captions up possible: two captions both at Bottom are at exactly the same
 * height, and no amount of careful dragging is needed to make that true. Free
 * placement would let two lines sit four pixels apart, which reads as a mistake
 * and is one.
 *
 * The vocabulary is the clip's own caption position — top, middle, bottom — so
 * a caption placed here means the same thing the setting means. `y` is the
 * fraction of the frame measured up from the bottom.
 */
/**
 * Where a caption can sit, as a share of the height up from the bottom.
 *
 * Chosen against the two things that actually compete with text in a vertical
 * video, rather than against the frame:
 *
 * - The platform's own furniture. TikTok, Reels and Shorts all paint a username,
 *   their own caption and a music ticker over roughly the bottom fifth. Bottom
 *   used to be 0.1, which is inside that — and lower than where an un-anchored
 *   caption lands, so choosing "bottom" moved a line *down* into the crowd.
 *   0.24 is the render's own default and clears it.
 *
 * - The subject. Shot on thirds, eyes sit around 0.6–0.7, so the optical-centre
 *   golden section (0.618) puts text straight across the face. The one that
 *   helps is the lower section, 0.382 — the broadcast lower third, under the
 *   face and over the furniture.
 */
/**
 * The three heights, as a share of the frame up from the bottom.
 *
 * Defaults, not constants: what "top" should mean depends on what is under it.
 * Footage that fills the frame wants a caption clear of the platform's own
 * furniture; a centred square cover leaves a band of black above it that a
 * caption can have all to itself. So the three are dials, and this is where
 * they start.
 */
export const CAPTION_ANCHORS = [
  // Below the watermark, which sits in the top-left corner: a top-anchored
  // caption is measured from the bottom, so at 0.76 its *bottom* was a quarter
  // of the way down and a second line grew up through the logo.
  { id: 'top', label: 'Top', y: 0.72 },
  { id: 'middle', label: 'Middle', y: 0.382 },
  // Clear of the platform's furniture, and no further up than it has to be.
  // A fifth of the frame is roughly where TikTok's own caption and username
  // start; 0.24 was a comfortable margin past that and read as mid-frame.
  { id: 'bottom', label: 'Bottom', y: 0.18 }
] as const;

export type CaptionAnchorId = (typeof CAPTION_ANCHORS)[number]['id'];

/**
 * The anchors as this clip has them set.
 *
 * One place to ask, so the renderer, the editor's overlay and the timeline's
 * own icon can't develop different ideas of where "top" is — which they did
 * once already, from three copies of three numbers.
 */
export function captionAnchors(
  adv: Pick<
    ClipAdvancedConfig,
    'captionTopPercent' | 'captionMiddlePercent' | 'captionBottomPercent'
  >
): { id: CaptionAnchorId; label: string; y: number }[] {
  const at: Record<CaptionAnchorId, number> = {
    top: adv.captionTopPercent / 100,
    middle: adv.captionMiddlePercent / 100,
    bottom: adv.captionBottomPercent / 100
  };
  return CAPTION_ANCHORS.map((a) => ({ id: a.id, label: a.label, y: at[a.id] ?? a.y }));
}

/**
 * Which of the three heights a caption is on.
 *
 * Captions written before `anchor` existed carry the height itself. The only
 * way to set it was to cycle through these same three, so the nearest one is
 * the one that was meant — matched against the table's own defaults rather than
 * this clip's dials, because the defaults are what it was written from.
 */
export function captionAnchorOf(caption: {
  anchor?: CaptionAnchorId;
  y?: number;
}): CaptionAnchorId {
  if (caption.anchor) return caption.anchor;
  if (typeof caption.y !== 'number') return 'bottom';

  let best: (typeof CAPTION_ANCHORS)[number] = CAPTION_ANCHORS[0];
  for (const a of CAPTION_ANCHORS) {
    if (Math.abs(a.y - caption.y) < Math.abs(best.y - caption.y)) best = a;
  }
  return best.id;
}

/** Where a caption actually sits, as a fraction of the height up from the bottom. */
export function captionY(
  caption: { anchor?: CaptionAnchorId; y?: number },
  adv: Parameters<typeof captionAnchors>[0]
): number {
  const id = captionAnchorOf(caption);
  return captionAnchors(adv).find((a) => a.id === id)?.y ?? 0.18;
}

/**
 * An effect as a clip or a caption stores it.
 *
 * A name and its dials, not the effect itself — what is stored has to survive
 * the effect being improved, renamed in the list or given another parameter,
 * and a copy of its behaviour would not. An id nobody recognises any more falls
 * back to plain `fade`, so a clip made against a pack that has since gone still
 * renders rather than failing.
 *
 * Lives here rather than with the effects because this is the stored shape, and
 * the stored shapes are all in this file. It also keeps the dependency running
 * one way: the effects know about the document, the document knows nothing
 * about them.
 */
export interface AppliedEffect {
  id: string;
  /** Only what was changed from the effect's own defaults. */
  params?: Record<string, number | string | boolean>;
}

/**
 * An effect on the footage, with an optional place on the timeline.
 *
 * No window means the whole clip, which is what a look usually is — a tape is
 * something the footage went through, not something that happens at 4.2
 * seconds. A window is for the ones that are events: a tear as the beat drops,
 * a glitch over one shot and not the next.
 *
 * `lane` is where it sits in the editor and nothing else, exactly as on a
 * caption. Two effects in one lane still both apply; the lane is about reading
 * the timeline, not about what the render does.
 */
export interface PlacedEffect extends AppliedEffect {
  /** Seconds into the clip. Absent means from the start. */
  start?: number;
  /** Absent means until the end. */
  end?: number;
  lane?: number;
}

/** What a caption does when nothing has asked for anything else. */
export const DEFAULT_CAPTION_EFFECT = 'fade';

/** A caption shown over the footage between two timestamps (seconds). */
export interface TimedCaption {
  start: number;
  end: number;
  text: string;
  /** Big and centred instead of lower-third — the `!` prefix in a caption. */
  headline?: boolean;
  /**
   * Its own colour, when it wants one.
   *
   * Absent is the ordinary case and means the clip decides — white, or the
   * brand colour if `colorizeCaption` is on. A caption sets this when it needs
   * to be read against a shot the others aren't over, and it holds a colour
   * rather than a name so that it stays what you picked.
   */
  color?: string | null;
  /**
   * The panel behind it: a colour, `'none'`, or nothing said.
   *
   * A colour rather than a switch, for the same reason the text is one — the
   * two are read together, and a caption that needs to be legible over a busy
   * shot usually needs a particular backdrop rather than the idea of one.
   *
   * Absent leaves it to the clip. `'none'` is a caption saying it wants no
   * panel even though the clip says otherwise, which a switch could say and an
   * ordinary colour could not.
   */
  background?: string | null;
  /**
   * Which of the three heights it sits at.
   *
   * The name of a height rather than the height itself, so that moving `Caption
   * top` in Advanced moves every caption that is on it. A caption used to store
   * the number, which meant it was pinned to wherever the dial happened to be
   * the moment you cycled it, and turning the dial afterwards did nothing.
   */
  anchor?: CaptionAnchorId;
  /**
   * The older form of the above: the height itself, as a fraction up from the
   * bottom.
   *
   * Only ever written by cycling through the three anchors, so it can be read
   * back as whichever one it is nearest to. Kept for captions saved before
   * `anchor` existed; nothing writes it now.
   */
  y?: number;
  /**
   * Which timeline row it sits in.
   *
   * Purely where it's drawn — unlike `y`, it changes nothing about the render.
   * Rows used to be worked out from which captions overlapped, which was tidy
   * and wrong: it decided for you, and a row you'd dragged something to was
   * overwritten the moment the arithmetic ran again. Overlapping is the
   * editor's business, so where things sit is theirs too.
   */
  lane?: number;
  /**
   * How it arrives, when it wants its own.
   *
   * Unset means the clip decides, exactly as with `color` — a clip states the
   * look its captions share and any one caption can differ, which is the
   * arrangement everything else about a caption already uses.
   *
   * There is no third state here, unlike `background`, and there doesn't need
   * to be one: `'none'` exists over there because "no panel, whatever the clip
   * says" is not a colour and so cannot be expressed as one. A caption wanting
   * the plain fade against a clip that asked for something louder just names
   * the fade, because the fade is an effect like any other.
   */
  effect?: AppliedEffect | null;
}

/**
 * Where a clip sits in the pipeline.
 *
 * draft → rendered → review → approved → queued → published, with `rejected`
 * as the branch off review. Re-rendering an approved clip drops it back to
 * `rendered`, so a change can never sneak past review on an old approval.
 */
export type ClipStatus = 'draft' | 'rendered' | 'review' | 'queued' | 'published';

export const CLIP_STATUS_LABELS: Record<ClipStatus, string> = {
  draft: 'Draft',
  rendered: 'Rendered',
  review: 'In review',
  queued: 'Queued',
  published: 'Published'
};

/**
 * Status colours, defined once because the overview and the editor both show
 * them and had drifted into two maps. They read as a ladder: grey while it's
 * being made, blue once there's a render, amber while someone's looking, violet
 * waiting its turn, green out in the world.
 */
export const CLIP_STATUS_STYLES: Record<ClipStatus, string> = {
  draft: 'bg-gray-700 text-gray-300',
  rendered: 'bg-sky-900 text-sky-300',
  review: 'bg-amber-900 text-amber-300',
  queued: 'bg-violet-900 text-violet-300',
  published: 'bg-emerald-900 text-emerald-300'
};

/** The same ladder as a dot colour. */
export const CLIP_STATUS_DOTS: Record<ClipStatus, string> = {
  draft: 'bg-gray-500',
  rendered: 'bg-sky-400',
  review: 'bg-amber-400',
  queued: 'bg-violet-400',
  published: 'bg-emerald-400'
};

/**
 * Platform names as their owners write them. `capitalize` gives "Tiktok" and
 * "Youtube"; anything unlisted falls back to it, so a new target still renders.
 */
export const PLATFORM_NAMES: Record<string, string> = {
  tiktok: 'TikTok',
  youtube: 'YouTube',
  instagram: 'Instagram',
  facebook: 'Facebook',
  x: 'X',
  bluesky: 'Bluesky'
};

/**
 * Platforms that can't be posted to from a workflow. TikTok's API only accepts
 * an upload into the account's inbox; a person still opens the app and posts
 * it. The best outcome for these is "draft", never "live", so a report saying
 * otherwise is taken as meaning the upload landed.
 */
export const MANUAL_PLATFORMS = new Set(['tiktok']);

/**
 * The turns a source clip can be corrected by, clockwise.
 *
 * Right angles only, and shared so the field, the dialog and the command that
 * validates them can't disagree about what counts as one. Free rotation would
 * be a different feature — this straightens footage that was stored wrong, and
 * anything between the four leaves the frame with corners to fill.
 */
export const CLIP_ROTATIONS = [0, 90, 180, 270] as const;
export type ClipRotation = (typeof CLIP_ROTATIONS)[number];

export type ClipAspect = '9:16' | '1:1' | '16:9';
export type ClipTone = 'none' | 'bw' | 'warm' | 'cool' | 'vintage';
export type ClipFill = 'blur' | 'black' | 'crop';

/**
 * The renderer's numeric internals — everything that used to be a constant in
 * the engine.
 *
 * These are separated from the creative options above because they behave
 * differently: the options are choices you make per clip, while these are dials
 * you set once (if ever) and forget. Splitting them keeps the everyday UI small
 * while leaving nothing locked away. Every field is optional in stored config;
 * DEFAULT_ADVANCED_CONFIG fills the gaps at render time.
 */
export interface ClipAdvancedConfig {
  // --- Output ---
  /** Constant output frame rate. 30 kills phone-video stutter. */
  fps: number;
  /** x264 quality, lower is better. */
  crf: number;
  /** Bitrate ceiling in Mbit/s, so grain and detail can't bloat the file. */
  maxrateMbps: number;
  audioBitrateKbps: number;
  /** x264 speed/efficiency tradeoff. */
  preset: 'ultrafast' | 'veryfast' | 'faster' | 'fast' | 'medium' | 'slow';

  // --- Loudness ---
  /** Integrated loudness target in LUFS. -14 is the social/streaming standard. */
  loudnormTarget: number;
  /** True-peak ceiling in dBTP. */
  loudnormTruePeak: number;
  /** Loudness range. */
  loudnormRange: number;
  /** Clips quieter than this (LUFS) are left alone, so silence isn't boosted into hiss. */
  loudnormFloor: number;
  /** How long a music bed takes to fade in or out at its own edges. */
  bedFadeSeconds: number;
  /**
   * Bed level when the music plays *under* the footage audio. Not a per-clip
   * choice: sitting under speech and standing alone are different jobs, so the
   * level follows the job — a bed replacing the clip audio plays at full.
   */
  musicBedVolume: number;

  // --- Intro and outro ---
  /** Intro length as a fraction of the first clip's duration. */
  introPercent: number;
  introMinSeconds: number;
  introMaxSeconds: number;
  /** Used when the first clip's duration can't be read. */
  introFallbackSeconds: number;
  outroSeconds: number;
  /** How long the body dissolves into the outro card. */
  outroOverlapSeconds: number;
  /** Background for the end/outro cards — the one place a solid colour is used. */
  cardBackground: string;

  // --- Branding placement ---
  /** Big intro logo width, as a percentage of frame width. */
  logoWidthPercent: number;
  /** Corner watermark width, as a percentage of frame width. */
  watermarkWidthPercent: number;
  /** Watermark inset from the left edge, in pixels. */
  watermarkX: number;
  /** Watermark inset from the top edge, in pixels. Kept clear of platform UI. */
  watermarkY: number;

  // --- Captions ---
  /** Caption font size = frame width / this. */
  captionSizeDivisor: number;
  /** Headline font size = frame width / this. */
  headlineSizeDivisor: number;
  /** Left/right caption margin in pixels. */
  captionMarginX: number;
  /** How solid the panel behind a caption is, 0–100. */
  captionBackdropPercent: number;
  /** Where each caption anchor sits, as a percentage up from the bottom. */
  captionTopPercent: number;
  captionMiddlePercent: number;
  captionBottomPercent: number;
  /** Font family for on-screen text. Empty picks the best available. */
  fontFamily: string;

  // --- Effects ---
  /** Blur radius behind letterboxed footage. */
  blurStrength: number;
  /** Film grain amount. */
  grainStrength: number;
  /** Ken Burns push-in speed per frame. */
  zoomRate: number;
  /** Maximum Ken Burns zoom factor. */
  zoomMax: number;
  /** Crossfade length between stitched clips. */
  xfadeSeconds: number;
  /**
   * Width of the edge-replication ring. Must exceed 8px: a 1080-wide source
   * isn't a multiple of 16, so H.264 pads its coded frame to 1088, and that
   * padding can surface as a coloured strip at a frame border.
   */
  edgeFillPixels: number;

  // --- Fades ---
  /**
   * Video fade-out length. There is deliberately no video fade-IN: it would
   * make frame 1 pure black, and every platform grabs frame 1 as the in-feed
   * preview, so the post would show a black card.
   */
  /** How long a fade on a single shot runs, either end. */
  clipFadeSeconds: number;
  videoFadeInSeconds: number;
  videoFadeOutSeconds: number;
  audioFadeInSeconds: number;
  audioFadeOutSeconds: number;

  // --- Cover still ---
  /** Mean luma (0-255) a candidate cover frame must reach to be accepted. */
  coverLumaThreshold: number;
}

export const DEFAULT_ADVANCED_CONFIG: ClipAdvancedConfig = {
  fps: 30,
  crf: 23,
  maxrateMbps: 10,
  audioBitrateKbps: 128,
  preset: 'fast',

  loudnormTarget: -14,
  loudnormTruePeak: -1.5,
  loudnormRange: 11,
  loudnormFloor: -32,
  bedFadeSeconds: 1.5,
  musicBedVolume: 0.25,

  introPercent: 0.18,
  introMinSeconds: 1.2,
  introMaxSeconds: 2.5,
  introFallbackSeconds: 1.8,
  outroSeconds: 2.0,
  outroOverlapSeconds: 0.6,
  cardBackground: '#0d0d0d',

  logoWidthPercent: 60,
  watermarkWidthPercent: 22,
  watermarkX: 32,
  watermarkY: 40,

  captionSizeDivisor: 18,
  captionBackdropPercent: 50,
  /*
   * A headline was 64px against a caption's 60 — six per cent, which nobody can
   * see and which made the aA switch look broken. Half as big again is the
   * smallest difference that reads as a decision rather than a rounding error.
   */
  headlineSizeDivisor: 12,
  captionMarginX: 80,
  captionTopPercent: 72,
  captionMiddlePercent: 38.2,
  captionBottomPercent: 18,
  fontFamily: '',

  blurStrength: 24,
  grainStrength: 16,
  zoomRate: 0.0008,
  zoomMax: 1.1,
  xfadeSeconds: 0.4,
  edgeFillPixels: 10,

  clipFadeSeconds: 0.5,
  videoFadeInSeconds: 0.4,
  videoFadeOutSeconds: 0.4,
  audioFadeInSeconds: 0.4,
  audioFadeOutSeconds: 0.4,

  coverLumaThreshold: 24
};

/**
 * Which dials the Advanced panel offers, and how they're grouped.
 *
 * Deliberately a subset of ClipAdvancedConfig rather than all of it. Every
 * field above still applies at render time and can still be overridden in
 * stored config — this list only decides what's worth putting in front of
 * someone. Three kinds of dial are left out on purpose:
 *
 *   - correctness constants, where a wrong value produces a broken render
 *     rather than a different look (edgeFillPixels has a hard floor of 8px;
 *     fps below 30 reintroduces the phone-video stutter the default exists to
 *     kill)
 *   - published standards, where the default *is* the answer (-14 LUFS and
 *     -1.5 dBTP are what every social platform normalises to anyway)
 *   - near-duplicates that don't survive contact with a real edit.
 *
 * Re-exposing one is a single line here.
 */
export const ADVANCED_GROUPS: {
  label: string;
  fields: { key: keyof ClipAdvancedConfig; label: string; step?: number; hint?: string }[];
}[] = [
  {
    label: 'Output',
    fields: [{ key: 'crf', label: 'Quality (CRF)', step: 1, hint: 'Lower is better quality' }]
  },
  {
    label: 'Branding placement',
    fields: [
      { key: 'logoWidthPercent', label: 'Intro graphic width (% of frame)', step: 1 },
      { key: 'watermarkWidthPercent', label: 'Watermark width (%)', step: 1 },
      { key: 'watermarkX', label: 'Watermark left (px)', step: 1 },
      { key: 'watermarkY', label: 'Watermark top (px)', step: 1, hint: 'Kept clear of platform UI' }
    ]
  },
  {
    label: 'Audio',
    fields: [
      {
        key: 'bedFadeSeconds',
        label: 'Music fade (s)',
        step: 0.1,
        hint: 'How long a bed takes to come up or go away at its own edges'
      },
      {
        // The most audible number in the render, and it was unreachable.
        key: 'musicBedVolume',
        label: 'Music under speech',
        step: 0.05,
        hint: 'How far a bed sits back when the footage keeps its own sound'
      },
      {
        key: 'audioFadeInSeconds',
        label: 'Audio fade in (s)',
        step: 0.1,
        hint: 'The whole clip, not a bed. Only used when the toggle is on'
      },
      { key: 'audioFadeOutSeconds', label: 'Audio fade out (s)', step: 0.1 }
    ]
  },
  {
    label: 'Timing',
    fields: [
      { key: 'introPercent', label: 'Intro length (fraction of clip)', step: 0.01 },
      { key: 'introMaxSeconds', label: 'Intro max (s)', step: 0.1 },
      { key: 'outroSeconds', label: 'Outro (s)', step: 0.1 },
      {
        key: 'outroOverlapSeconds',
        label: 'Outro dissolve (s)',
        step: 0.1,
        hint: 'How long the last shot takes to become the card'
      },
      {
        key: 'clipFadeSeconds',
        label: 'Shot fade (s)',
        step: 0.1,
        hint: 'Either end of a shot that has one'
      },
      {
        key: 'videoFadeInSeconds',
        label: 'Picture fade in (s)',
        step: 0.1,
        hint: 'Only used when the toggle is on'
      },
      {
        key: 'videoFadeOutSeconds',
        label: 'Picture fade out (s)',
        step: 0.1,
        hint: 'Only used when the toggle is on'
      }
    ]
  },
  {
    label: 'Captions',
    fields: [
      {
        key: 'captionSizeDivisor',
        label: 'Caption size divisor',
        step: 1,
        hint: 'Font size = frame width / this, so lower is bigger'
      },
      {
        // The other half of the pair. Only the first was ever on this panel, so
        // the two could drift to within six per cent of each other and the aA
        // switch looked broken with no dial to explain it.
        key: 'headlineSizeDivisor',
        label: 'Big caption size divisor',
        step: 1,
        hint: 'The aA switch. Lower than the one beside it, or big is not big'
      },
      {
        key: 'captionTopPercent',
        label: 'Caption top (% up)',
        step: 1,
        hint: 'Where the frame icon puts a caption at the top. Higher is higher'
      },
      { key: 'captionMiddlePercent', label: 'Caption middle (% up)', step: 0.5 },
      {
        key: 'captionBottomPercent',
        label: 'Caption bottom (% up)',
        step: 1,
        hint: 'Below about 15 the platforms start drawing their own captions over it'
      },
      {
        key: 'captionMarginX',
        label: 'Caption side margin (px)',
        step: 4,
        hint: 'Where lines wrap, measured in the finished frame'
      },
      {
        key: 'captionBackdropPercent',
        label: 'Caption backdrop (% solid)',
        step: 5,
        hint: 'How much of the picture the panel behind a caption covers up'
      }
    ]
  },
  {
    label: 'Effects',
    fields: [
      { key: 'blurStrength', label: 'Background blur', step: 1 },
      { key: 'grainStrength', label: 'Grain amount', step: 1 },
      { key: 'xfadeSeconds', label: 'Clip crossfade (s)', step: 0.1 }
    ]
  }
];

/**
 * Everything that shapes a render. Defaults live in one place
 * (DEFAULT_CLIP_CONFIG) so a partial config from an older project still renders.
 */
export interface ClipRenderConfig {
  aspect: ClipAspect;

  // Caption look
  colorizeCaption: boolean; // caption in the brand accent colour
  captionBackground: boolean; // panel behind the caption
  /**
   * What colour that panel is, when there is one.
   *
   * It was always black, which is the right neutral scrim and the wrong answer
   * for anyone who wanted a different one — a caption could pick any colour for
   * its own panel while the clip could only say black or nothing. Absent keeps
   * black, so nothing made before this looks different.
   */
  captionBackdropColor?: string | null;
  /**
   * How captions arrive, unless one of them says otherwise.
   *
   * The clip's choice, in the same sense as the two above: it sets the house
   * style and a single caption can still differ. Unset is the plain fade.
   */
  captionEffect?: AppliedEffect | null;

  // Footage look
  /**
   * Processed looks over the footage — tape, film, camcorder, signal loss.
   *
   * Deliberately separate from `tone` rather than more entries in it. A tone is
   * a grade, one filter deciding what colour things are; these are several
   * filters imitating something the picture has been through, they carry dials
   * of their own, and they can be placed at a moment rather than over the whole
   * clip. Empty leaves the footage alone.
   *
   * A list because the timeline can hold more than one: a tape look across the
   * whole clip and a tear on the chorus are two different statements, and
   * making them one field would mean choosing.
   */
  effects?: PlacedEffect[];
  /**
   * The single look this used to be, still read.
   *
   * Only ever written by a version of the editor that could not place effects.
   * Nothing writes it now; it is folded in as an unplaced entry when a clip is
   * rendered, so a project saved before the lane existed looks the same today.
   */
  pictureEffect?: AppliedEffect | null;
  fill: ClipFill; // how non-matching footage fills the frame
  tone: ClipTone;
  grain: boolean;
  vignette: boolean;
  zoom: boolean; // slow Ken Burns push-in
  xfade: boolean; // crossfade between sources
  speed: number; // 0.5–2

  /*
   * Fades. Picture and sound are separate switches, because a hard visual cut
   * into an audio fade is a normal choice.
   *
   * There used to be no video fade-in at all, on the grounds that it blacks out
   * frame 1 and every platform grabs that for the cover. That was the right
   * call for a renderer that took a folder of clips and made one decision about
   * them; it is the wrong shape for an editor, where the consequence is
   * something to be told about once and then trusted with. The field says so in
   * its hint rather than by not existing.
   */
  videoFadeIn: boolean;
  videoFadeOut: boolean;
  audioFadeIn: boolean;
  audioFadeOut: boolean;

  // Branding
  intro: boolean; // logo animates in over the first clip
  outro: boolean; // dissolve out to a logo card
  watermark: boolean; // persistent corner logo
  /**
   * A mark of its own for one of the three stages.
   *
   * They shared a graphic because they usually want one — but not always: an
   * outro card is a place to put something other than the logo you have been
   * watermarking the corner with, and an opening title is not the same thing as
   * a standing mark. Absent means "whatever the clip uses", which is the same
   * arrangement a caption has with its colour.
   */
  introGraphicMediaId?: number | null;
  watermarkGraphicMediaId?: number | null;
  outroGraphicMediaId?: number | null;
  // Nullable, not just optional: the UI needs to express "cleared" distinctly
  // from "never set" so unsetting a logo or music bed actually persists.
  logoMediaId?: number | null; // legacy per-clip logo; superseded by the three stages
  /**
   * Caption accent colour. Named for the logo historically, but it only ever
   * tints captions — the logo bitmap is composited untouched. A brand's own
   * accentColor takes precedence; this then settings.colorAccent.
   */
  logoColor?: string | null;

  // Audio
  loudnorm: boolean; // normalise to -14 LUFS
  /**
   * The beds replace the footage audio entirely.
   *
   * The only music setting still living here. Every other one — which track,
   * when it comes in, its fades, whether it ducks — moved to `clip_audio` rows
   * when a clip stopped being limited to one of them. This stayed because it is
   * a decision about the footage, not about any track: with two beds playing,
   * "replace the clip audio" is asked once, not twice.
   */
  musicOnly: boolean;

  /** Renderer internals. Partial — unset fields fall back to the defaults. */
  advanced?: Partial<ClipAdvancedConfig>;
}

export const DEFAULT_CLIP_CONFIG: ClipRenderConfig = {
  aspect: '9:16',
  colorizeCaption: true,
  captionBackground: false,
  fill: 'blur',
  tone: 'none',
  grain: false,
  vignette: false,
  zoom: false,
  xfade: false,
  speed: 1,
  videoFadeIn: false,
  videoFadeOut: false,
  audioFadeIn: false,
  // On, because every preset used to turn it on and none of them should have to:
  // music that stops dead at the last frame sounds like a mistake in any look.
  audioFadeOut: true,
  intro: true,
  outro: false,
  watermark: true,
  loudnorm: true,
  musicOnly: false
};

/**
 * Named starting points for the look.
 *
 * Applying a preset overwrites only the creative options it names — sources,
 * text, music and anything in Advanced are left alone, so switching presets to
 * compare them doesn't cost you the rest of your setup. Pressing the one that
 * is already on turns it off again, putting those same options back to their
 * defaults.
 *
 * There used to be a `clean` preset that set everything to nothing, and it was
 * a tile spent saying what a new project already says: every field it named was
 * the default. Being able to switch one off says it better and leaves the slot
 * for a look.
 *
 * A preset is about the picture: the grade, the motion, how one shot meets the
 * next. It deliberately says nothing about the sound or about whether there is
 * an outro card, because neither is a look — a fade on the music and a card on
 * the end are decisions about the clip, and pressing Cinematic to see a grade
 * shouldn't quietly make either for you.
 *
 * The look itself is named rather than rebuilt. These used to mix their own out
 * of `tone`, `grain` and `vignette` — the same ingredients the footage effects
 * are made of — so a preset and an effect together gave you two vignettes and
 * two lots of grain, which is muddier than either alone and reads as a fault.
 * Naming one keeps the picture in one place, and means improving a look
 * improves every preset that uses it. Those three fields are still set, to
 * `none` and `false`, because a preset has to be able to turn off what the one
 * before it turned on.
 */
export interface ClipPreset {
  id: string;
  label: string;
  description: string;
  config: Partial<ClipRenderConfig>;
}

export const CLIP_PRESETS: ClipPreset[] = [
  {
    id: 'camcorder',
    label: 'Camcorder',
    description: 'Scan lines, a bulging lens and a hand that never quite holds still.',
    config: {
      effects: [{ id: 'camcorder' }],
      tone: 'none',
      grain: false,
      vignette: false,
      // Hard cuts and a fixed frame: a tape is what somebody filmed, not what
      // somebody edited, and a slow push in reads as the opposite of that.
      zoom: false,
      videoFadeIn: false,
      videoFadeOut: false,
      xfade: false,
      captionBackground: false,
      colorizeCaption: false
    }
  },
  {
    id: 'punchy',
    label: 'Punchy',
    description: 'Warm and contrasty, built to stop a scroll.',
    config: {
      effects: [{ id: 'punch' }],
      tone: 'none',
      grain: false,
      vignette: false,
      zoom: true,
      videoFadeOut: false,
      xfade: true,
      captionBackground: false,
      colorizeCaption: true
    }
  },
  {
    id: 'cinematic',
    label: 'Cinematic',
    description: 'The Super 8 look — graded, grainy, vignetted — with dissolves and a fade out.',
    config: {
      effects: [{ id: 'super8' }],
      tone: 'none',
      grain: false,
      vignette: false,
      zoom: true,
      videoFadeOut: true,
      xfade: true,
      captionBackground: false,
      colorizeCaption: false
    }
  },
  {
    id: 'documentary',
    label: 'Documentary',
    description: 'Black and white, lower-third captions on a dark box, no motion tricks.',
    config: {
      effects: [{ id: 'mono', params: { grain: 16 } }],
      tone: 'none',
      grain: false,
      vignette: false,
      zoom: false,
      videoFadeOut: true,
      xfade: false,
      captionBackground: true,
      colorizeCaption: false
    }
  }
];

/** The three places a clip wears its mark. */
export type BrandStage = 'intro' | 'watermark' | 'outro';

/**
 * The mark a stage was given, or nothing if it was never given one.
 *
 * Only what is set here — the fallback is the caller's, because the site
 * default is not something this file can see. It used to fall back to a
 * clip-wide `graphicMediaId` first, which was left over from when one picker
 * dressed all three stages. Nothing could set that field once the three chips
 * replaced the picker, and nothing could clear it either, so a clip carrying
 * one silently overruled the option labelled "Site default": choosing it wrote
 * null, this read straight past the null to the old value, and both the tick in
 * the menu and the render came back with the mark you had just tried to drop.
 *
 * Undefined and null both mean unset. There is no third state, because "no mark
 * at all" is what the switch beside it is for.
 */
export function stageGraphicId(
  config: Pick<
    ClipRenderConfig,
    'introGraphicMediaId' | 'watermarkGraphicMediaId' | 'outroGraphicMediaId'
  >,
  stage: BrandStage
): number | null | undefined {
  return stage === 'intro'
    ? config.introGraphicMediaId
    : stage === 'watermark'
      ? config.watermarkGraphicMediaId
      : config.outroGraphicMediaId;
}

/**
 * What colour a caption is drawn in, here and in the render.
 *
 * One answer in one place, asked by the overlay and by `buildAss`: the
 * caption's own colour if it has one, otherwise the clip's choice between the
 * brand colour and white.
 */
export function captionColor(
  caption: { color?: string | null },
  config: { colorizeCaption?: boolean },
  accent: string
): string {
  return caption.color || (config.colorizeCaption ? accent : '#ffffff');
}

/** A caption asking for no panel at all, as against not having been asked. */
export const NO_BACKDROP = 'none';

/**
 * What colour the panel behind a caption is, or `null` for no panel.
 *
 * One answer for the overlay and the render. The caption's own if it gave one,
 * otherwise the clip's switch, which means black — the neutral scrim it has
 * always drawn. How solid that panel is belongs to the clip either way, since
 * it is about legibility rather than about this caption.
 */
export function captionBackdrop(
  caption: { background?: string | null },
  config: { captionBackground?: boolean; captionBackdropColor?: string | null }
): string | null {
  const own = caption.background;
  if (own === NO_BACKDROP) return null;
  if (own) return own;
  return config.captionBackground ? (config.captionBackdropColor ?? '#000000') : null;
}
