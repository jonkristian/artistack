/**
 * Clip studio configuration types.
 *
 * These live outside `$lib/server` because the admin UI needs the defaults at
 * runtime, and SvelteKit refuses to bundle a server module into browser code.
 * The database schema imports them from here.
 */

/** A caption shown over the footage between two timestamps (seconds). */
export interface TimedCaption {
  start: number;
  end: number;
  text: string;
  /** Big and centred instead of lower-third (thehow's `!` prefix). */
  headline?: boolean;
}

/**
 * Where a clip sits in the pipeline.
 *
 * draft → rendered → review → approved → queued → published, with `rejected`
 * as the branch off review. Re-rendering an approved clip drops it back to
 * `rendered`, so a change can never sneak past review on an old approval.
 */
export type ClipStatus =
  | 'draft'
  | 'rendered'
  | 'review'
  | 'approved'
  | 'rejected'
  | 'queued'
  | 'published';

export const CLIP_STATUS_LABELS: Record<ClipStatus, string> = {
  draft: 'Draft',
  rendered: 'Rendered',
  review: 'In review',
  approved: 'Approved',
  rejected: 'Rejected',
  queued: 'Queued',
  published: 'Published'
};

/**
 * Status colours, defined once because the overview and the editor both show
 * them and had drifted into two maps. Approved and published are both good
 * outcomes, so they share the green family but stay distinguishable — published
 * is the end of the road, not a synonym for approved.
 */
export const CLIP_STATUS_STYLES: Record<ClipStatus, string> = {
  draft: 'bg-gray-700 text-gray-300',
  rendered: 'bg-sky-900 text-sky-300',
  review: 'bg-amber-900 text-amber-300',
  approved: 'bg-teal-900 text-teal-300',
  rejected: 'bg-red-900 text-red-300',
  queued: 'bg-violet-900 text-violet-300',
  published: 'bg-emerald-900 text-emerald-300'
};

/** The same ladder as a dot colour. */
export const CLIP_STATUS_DOTS: Record<ClipStatus, string> = {
  draft: 'bg-gray-500',
  rendered: 'bg-sky-400',
  review: 'bg-amber-400',
  approved: 'bg-teal-400',
  rejected: 'bg-red-400',
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

export type ClipAspect = '9:16' | '1:1' | '16:9';
export type ClipTone = 'none' | 'bw' | 'warm' | 'cool' | 'vintage';
export type ClipFill = 'blur' | 'black' | 'crop';
export type CaptionPosition = 'top' | 'center' | 'bottom';

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
  watermarkX: 48,
  watermarkY: 96,

  captionSizeDivisor: 18,
  headlineSizeDivisor: 17,
  captionMarginX: 80,
  fontFamily: '',

  blurStrength: 24,
  grainStrength: 16,
  zoomRate: 0.0008,
  zoomMax: 1.1,
  xfadeSeconds: 0.4,
  edgeFillPixels: 10,

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
    label: 'Timing',
    fields: [
      { key: 'introPercent', label: 'Intro length (fraction of clip)', step: 0.01 },
      { key: 'introMaxSeconds', label: 'Intro max (s)', step: 0.1 },
      { key: 'outroSeconds', label: 'Outro (s)', step: 0.1 }
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
  captionPosition: CaptionPosition;
  colorizeCaption: boolean; // caption in the brand accent colour
  captionBackground: boolean; // dark box behind the caption

  // Footage look
  fill: ClipFill; // how non-matching footage fills the frame
  tone: ClipTone;
  grain: boolean;
  vignette: boolean;
  zoom: boolean; // slow Ken Burns push-in
  xfade: boolean; // crossfade between sources
  speed: number; // 0.5–2

  // Fades. Picture and sound are separate switches: a hard visual cut into an
  // audio fade is a normal choice, and there is deliberately no video fade-in
  // (it would black out frame 1, which every platform uses as the preview).
  videoFadeOut: boolean;
  audioFadeIn: boolean;
  audioFadeOut: boolean;

  // Branding
  intro: boolean; // logo animates in over the first clip
  outro: boolean; // dissolve out to a logo card
  watermark: boolean; // persistent corner logo
  /**
   * Which designated clip graphic to dress this clip with. Null falls back to
   * the site default, and if there isn't one, to the favicon.
   */
  graphicMediaId?: number | null;
  /**
   * Pick a random graphic at render time, ignoring graphicMediaId. The pick is
   * recorded on the project afterwards, so which one went out is never a
   * mystery.
   */
  randomGraphics: boolean;
  // Nullable, not just optional: the UI needs to express "cleared" distinctly
  // from "never set" so unsetting a logo or music bed actually persists.
  logoMediaId?: number | null; // legacy per-clip logo; superseded by graphicMediaId
  /**
   * Caption accent colour. Named for the logo historically, but it only ever
   * tints captions — the logo bitmap is composited untouched. A brand's own
   * accentColor takes precedence; this then settings.colorAccent.
   */
  logoColor?: string | null;

  // Audio
  loudnorm: boolean; // normalise to -14 LUFS
  musicMediaId?: number | null; // music bed from the media library
  musicFadeIn: number; // seconds
  musicFadeOut: number; // seconds
  musicStart: number; // hold the bed until this point on the video timeline
  musicSeek: number; // in-point into the bed file
  /** Crossfade the footage audio out into the bed at musicStart, in seconds. */
  musicCrossfade?: number | null;
  musicOnly: boolean; // bed replaces the footage audio entirely
  duck: boolean; // duck the bed under speech

  /** Renderer internals. Partial — unset fields fall back to the defaults. */
  advanced?: Partial<ClipAdvancedConfig>;
}

export const DEFAULT_CLIP_CONFIG: ClipRenderConfig = {
  aspect: '9:16',
  captionPosition: 'bottom',
  colorizeCaption: true,
  captionBackground: false,
  fill: 'blur',
  tone: 'none',
  grain: false,
  vignette: false,
  zoom: false,
  xfade: false,
  speed: 1,
  videoFadeOut: false,
  audioFadeIn: false,
  audioFadeOut: false,
  intro: true,
  outro: false,
  watermark: true,
  randomGraphics: false,
  loudnorm: true,
  musicFadeIn: 1.5,
  musicFadeOut: 1.5,
  musicStart: 0,
  musicSeek: 0,
  musicOnly: false,
  duck: false
};

/**
 * Named starting points for the look.
 *
 * Applying a preset overwrites only the creative options it names — sources,
 * text, music and anything in Advanced are left alone, so switching presets to
 * compare them doesn't cost you the rest of your setup.
 */
export interface ClipPreset {
  id: string;
  label: string;
  description: string;
  config: Partial<ClipRenderConfig>;
}

export const CLIP_PRESETS: ClipPreset[] = [
  {
    id: 'clean',
    label: 'Clean',
    description: 'Straight footage, no grade or grain. Lets the picture speak.',
    config: {
      tone: 'none',
      grain: false,
      vignette: false,
      zoom: false,
      videoFadeOut: false,
      audioFadeIn: false,
      audioFadeOut: true,
      xfade: false,
      captionBackground: false,
      colorizeCaption: true
    }
  },
  {
    id: 'punchy',
    label: 'Punchy',
    description: 'Warm and contrasty, captions centred. Built to stop a scroll.',
    config: {
      tone: 'warm',
      grain: false,
      vignette: true,
      zoom: true,
      videoFadeOut: false,
      audioFadeIn: false,
      audioFadeOut: true,
      xfade: true,
      captionPosition: 'center',
      captionBackground: false,
      colorizeCaption: true
    }
  },
  {
    id: 'cinematic',
    label: 'Cinematic',
    description: 'Graded, grainy and vignetted, with dissolves and a fade out.',
    config: {
      tone: 'vintage',
      grain: true,
      vignette: true,
      zoom: true,
      videoFadeOut: true,
      audioFadeIn: true,
      audioFadeOut: true,
      xfade: true,
      captionPosition: 'bottom',
      captionBackground: false,
      colorizeCaption: false,
      outro: true
    }
  },
  {
    id: 'documentary',
    label: 'Documentary',
    description: 'Black and white, lower-third captions on a dark box, no motion tricks.',
    config: {
      tone: 'bw',
      grain: true,
      vignette: false,
      zoom: false,
      videoFadeOut: true,
      audioFadeIn: true,
      audioFadeOut: true,
      xfade: false,
      captionPosition: 'bottom',
      captionBackground: true,
      colorizeCaption: false
    }
  }
];
