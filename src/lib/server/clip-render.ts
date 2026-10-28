import { execFile } from 'child_process';
import { promisify } from 'util';
import { mkdtemp, mkdir, rm, readdir, writeFile, stat } from 'fs/promises';
import { join, basename } from 'path';
import { runFfmpeg, probeVideo, probeDuration, rasterizeSvg, hasBinary } from './ffmpeg';
import { DEFAULT_STILL_SECONDS } from './schema';
import { DATA_DIR } from './paths';
import type { AppliedEffect } from '$lib/clips/types';
import { fontById } from '$lib/fonts';
import { captionFont } from './font-files';
import {
  captionAnchors,
  captionBackdrop,
  captionColor,
  captionY,
  DEFAULT_CLIP_CONFIG,
  DEFAULT_ADVANCED_CONFIG,
  type ClipRenderConfig,
  type ClipAdvancedConfig,
  type ClipFill,
  type ClipAudioTrack,
  type TimedCaption,
  type ClipAspect
} from '$lib/clips/types';
import { alreadyFills, driftWindow, turnedSize } from '$lib/clips/framing';
import {
  CAPTION_SIZE_DIVISOR,
  captionBackdropOpacity,
  captionBorder,
  captionBorderWidth,
  captionFontId,
  captionX
} from '$lib/clips/types';
import { captionAss, captionText } from '$lib/clips/caption-html';
import { bedFades, placeBeds } from '$lib/clips/audio';
import {
  captionEffectOf,
  captionSeed,
  clipEffects,
  pictureFilters,
  pictureGraph
} from '$lib/clips/effects';
import sharp from 'sharp';

const execFileAsync = promisify(execFile);

/**
 * Branded social-clip renderer.
 *
 * A port of the standalone ffmpeg engine this grew out of, generalised to take
 * its branding from the site's own settings instead of one act's hardcoded logo
 * set and palette. The pipeline and its filter graphs follow the original
 * closely — the ordering, timings and workarounds here were tuned against real
 * phone footage, and the comments record why each one exists. The pipeline runs
 * in the numbered stages marked inline below.
 */

/**
 * Where a render does its working-out.
 *
 * Under `data/`, not the system temp directory. On this machine and on plenty
 * of others `/tmp` is a tmpfs — which is to say RAM — and a render's staging
 * files run to gigabytes, so the temporary copies of a clip were being held in
 * memory and counted against a limit that has nothing to do with disk. `data/`
 * is a real volume in production and a real directory locally, and it's where
 * the finished file lands anyway, so the last move is a rename rather than a
 * copy across filesystems.
 */
const STAGING_ROOT = join(DATA_DIR, 'renders');

async function stagingDir(): Promise<string> {
  await mkdir(STAGING_ROOT, { recursive: true });
  return mkdtemp(join(STAGING_ROOT, 'clip-'));
}

/**
 * Clears staging left behind by a render that never finished.
 *
 * The working directory is removed in a `finally`, which covers a failure and
 * doesn't cover the process being killed — and each abandoned set is gigabytes.
 * Called at startup, alongside the sweep that fails the jobs those renders
 * belonged to.
 */
/**
 * Long enough that nothing still being written is ever inside it.
 *
 * This used to take every `clip-*` directory it found, on the reasoning that it
 * only runs at startup and nothing can be rendering yet. That is true of
 * production and false of development, where Vite re-evaluates server modules
 * on save and `hooks.server.ts` calls `initScheduler` at the top level — so
 * saving a file during a render deleted that render's working directory out
 * from under it. What you saw was ffprobe failing on a part that existed a
 * moment earlier, and a retry working because nothing was saved that time.
 *
 * An hour is far longer than any render and far shorter than anything worth
 * keeping. It is the same reasoning, and the same number, as the clip sweep.
 */
const STAGING_GRACE_MS = 60 * 60 * 1000;

export async function clearAbandonedStaging(): Promise<number> {
  const entries = await readdir(STAGING_ROOT, { withFileTypes: true }).catch(() => []);
  let cleared = 0;

  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith('clip-')) continue;

    const path = join(STAGING_ROOT, entry.name);
    // Untouched for an hour, or leave it alone: a render in flight is writing
    // into one of these right now.
    const touched = await stat(path)
      .then((info) => Math.max(info.mtimeMs, info.ctimeMs))
      .catch(() => 0);
    if (touched && Date.now() - touched < STAGING_GRACE_MS) continue;

    await rm(path, { recursive: true, force: true }).catch(() => {});
    cleared += 1;
  }

  return cleared;
}

/**
 * The intro can never take more than this fraction of the first clip, whatever
 * the configured length works out to, so a post-intro phase always exists.
 */
const INTRO_MAX_SHARE = 0.6;

/**
 * Overlay option for compositing a `-loop 1` still onto footage.
 *
 * The looped image input never ends, and without this the overlay keeps
 * emitting frames past the end of the footage — `-shortest` does not reliably
 * cut it, and the clip comes out roughly half a second to two seconds long,
 * which then compounds through the join and outro offsets. `shortest=1` ends
 * the overlay with its main input, which is the footage.
 */
const OVERLAY_STILL = 'shortest=1';

const DIMENSIONS: Record<ClipAspect, { width: number; height: number }> = {
  '9:16': { width: 1080, height: 1920 },
  '1:1': { width: 1080, height: 1080 },
  '16:9': { width: 1920, height: 1080 }
};

/** Colour grades, keyed by tone. */
const TONE_FILTERS: Record<string, string> = {
  bw: 'hue=s=0,eq=contrast=1.06',
  warm: 'colorbalance=rs=0.06:gs=0.02:bs=-0.06:rm=0.04:bm=-0.05,eq=saturation=1.05',
  cool: 'colorbalance=rs=-0.06:bs=0.08:rm=-0.03:bm=0.05',
  vintage: 'curves=preset=vintage,eq=saturation=0.92'
};

/**
 * The grade-and-texture part of a look, for still previews.
 *
 * Deliberately only the filters that survive a single frame: zoom, crossfade
 * and the fades need motion to mean anything, so a still that included them
 * would misrepresent the preset rather than describe it. Shares TONE_FILTERS
 * with the renderer so a preview can't drift from the real output.
 */
export function previewFilters(
  config: Partial<ClipRenderConfig>,
  adv: ClipAdvancedConfig = DEFAULT_ADVANCED_CONFIG
): string[] {
  const filters: string[] = [];
  const tone = TONE_FILTERS[config.tone ?? 'none'];
  if (tone) filters.push(tone);
  if (config.vignette) filters.push('vignette');
  if (config.grain) filters.push(`noise=alls=${adv.grainStrength}:allf=t`);
  /*
   * The same fragments the render uses, so a look cannot be one thing in the
   * tile and another in the file. `stillOnly` drops any effect that needs
   * motion to mean anything, on the same grounds the zoom and the crossfade are
   * left out: a still that included it would misrepresent the look rather than
   * describe it.
   */
  filters.push(
    ...pictureFilters(
      config,
      {
        ...(DIMENSIONS[config.aspect ?? '9:16'] ?? DIMENSIONS['9:16']),
        fps: adv.fps,
        // A swatch is one frame; nothing that moves survives `stillOnly`, so
        // the length it would have moved over is never consulted.
        duration: 0
      },
      { stillOnly: true }
    )
  );
  return filters;
}

/**
 * Fonts tried in order for on-screen text; the first one fontconfig knows wins.
 * Only consulted when the config doesn't name a font explicitly.
 */
const FONT_PREFERENCES = [
  'Roboto Condensed',
  'Archivo Narrow',
  'Liberation Sans Narrow',
  'DejaVu Sans Condensed',
  'Noto Sans',
  'Liberation Sans'
];

export interface ClipSourceInput {
  path: string;
  /** Trim window in seconds; null/undefined uses the whole clip. */
  trimStart?: number | null;
  trimEnd?: number | null;
  /** Replace this clip's audio with silence. */
  muted?: boolean | null;
  /** Overrides the project watermark setting; null inherits. */
  watermark?: boolean | null;
  /** Where this placement begins on the timeline, in seconds. */
  start?: number;
  /** Which row it sits in; higher lanes are composited over lower ones. */
  lane?: number;
  /** Degrees clockwise to turn the footage before anything else. */
  rotation?: number | null;
  /** Fade this shot up from, and down to, whatever is underneath it. */
  fadeIn?: boolean | null;
  fadeOut?: boolean | null;
  /**
   * A still rather than footage.
   *
   * Told rather than sniffed, because the caller has the media row and the
   * renderer only has a path. Everything downstream is unaffected: a still is
   * turned into a part of the right length here, and by the time the composite
   * runs it is an mp4 like any other.
   */
  still?: boolean | null;
  /**
   * How this shot fills the frame; null inherits the clip's own setting.
   *
   * A property of the placement rather than of the clip, because two shots in
   * one edit can want different answers — and a still beside footage almost
   * always does. A portrait photo wants cropping to fill; a landscape one
   * cropped to 9:16 loses most of itself and wants the blurred surround.
   */
  fit?: ClipFill | null;
  /** How far into the picture this shot sits, on top of the fill. 1 is as-is. */
  zoom?: number | null;
  /** Drift slowly across whatever the fill crops away. */
  pan?: boolean | null;
  /**
   * This shot's own effects, run over this shot and no other.
   *
   * The clip's `effects` are laid over the finished picture, where they can be
   * placed at a moment and run on the clip's clock. These run here, inside the
   * part, where the clock starts at zero and the only footage in sight is this
   * shot's — which is precisely what "this shot looks like this" means, and
   * what a windowed effect on the clip could only approximate until the shot
   * was moved.
   */
  effects?: AppliedEffect[] | null;
}

export interface RenderInput {
  sources: ClipSourceInput[];
  config: Partial<ClipRenderConfig>;
  captions?: TimedCaption[];
  /**
   * Graphics per placement (SVG or raster). The caller resolves each one,
   * falling back to the variant's primary, so an unset placement arrives here
   * already filled in rather than as a decision the renderer has to make.
   */
  introPath?: string | null;
  watermarkPath?: string | null;
  outroPath?: string | null;
  /** The beds, in the order they should be mixed. */
  audio?: ClipAudioInput[];
  outputPath: string;
}

export interface RenderOptions {
  onProgress?: (percent: number) => void;
  signal?: AbortSignal;
  /** Receives human-readable progress lines, mirroring the original's stdout. */
  onLog?: (line: string) => void;
}

export interface RenderResult {
  outputPath: string;
  /** Branded cover still, written next to the output. */
  coverPath?: string;
  durationSeconds: number;
}

/**
 * A staging file's encoder settings: fast, and good enough to survive.
 *
 * Nothing between the first stage and the last is ever looked at — each one is
 * decoded by the next and deleted at the end — so the only two things its
 * encoder settings decide are how long that pass takes and how much of the
 * picture reaches the pass after it. The configured preset answers a question
 * nobody asked of these files: how small they are.
 *
 * Measured on 1080x1920 footage, `veryfast` is 2.4x quicker than `fast` (2.90s
 * against 6.91s for twenty seconds), and at this CRF it also throws away less —
 * which matters, because on the composite path the picture is encoded three
 * times before anyone sees it and each pass compounds the one before.
 */
const STAGING_PRESET = 'veryfast';
const STAGING_CRF = 18;

/**
 * And a ceiling, because CRF alone has none.
 *
 * Film grain is random, and random doesn't compress: asked for CRF 18 with
 * nothing to stop it, x264 encoded a grainy 155-second staging file at 165
 * Mbit/s — 3.2GB, for something that gets decoded once and deleted. Four of
 * those and a composite filled a 16GB tmpfs and the render died writing the
 * one file anybody wanted.
 *
 * Generous rather than tight: twice what the finished clip is allowed, so clean
 * footage is still governed by the CRF and only the pathological cases are
 * caught. It is a ceiling, not a target.
 */
const stagingMaxrate = (adv: ClipAdvancedConfig) => Math.max(adv.maxrateMbps * 2, 16);

/**
 * Encoder settings, derived from the advanced config.
 *
 * The bitrate cap stops grain and detail from bloating the file; bufsize is
 * kept at 1.6x maxrate, which is the ratio the original engine used. `final`
 * adds faststart, putting the moov atom up front for web playback — only worth
 * it on the file that actually gets served, and a whole-file remux on one that
 * isn't.
 */
function encodeArgs(adv: ClipAdvancedConfig, final = false): string[] {
  const args = [
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-preset',
    final ? adv.preset : STAGING_PRESET,
    '-crf',
    String(final ? adv.crf : Math.min(adv.crf, STAGING_CRF)),
    ...(() => {
      const cap = final ? adv.maxrateMbps : stagingMaxrate(adv);
      return ['-maxrate', `${cap}M`, '-bufsize', `${(cap * 1.6).toFixed(1)}M`];
    })(),
    '-r',
    String(adv.fps),
    '-c:a',
    'aac',
    '-b:a',
    `${adv.audioBitrateKbps}k`,
    '-ar',
    '48000',
    '-ac',
    '2'
  ];
  return final ? [...args, '-movflags', '+faststart'] : args;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Formats seconds as an ASS timestamp (h:mm:ss.cc). */
function assTime(seconds: number): string {
  const t = Math.max(0, seconds);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t - h * 3600) / 60);
  const s = t - h * 3600 - m * 60;
  return `${h}:${String(m).padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}`;
}

/** #RRGGBB (or 0xRRGGBB) to ASS's &H00BBGGRR byte order. */
function assColor(hex: string): string {
  const h = hex.replace(/^#|^0x/i, '').padEnd(6, '0');
  return `&H00${h.slice(4, 6)}${h.slice(2, 4)}${h.slice(0, 2)}`.toUpperCase();
}

/**
 * Inside [ ... ] spans, turns spaces into libass hard-spaces so a phrase like
 * [LIVE SESSION] never wraps mid-way. Brackets are stripped; text outside them
 * wraps
 * normally.
 */
function hardSpaces(text: string): string {
  return text.replace(/\[([^\]]*)\]/g, (_, inner: string) => inner.replace(/ /g, '\\h'));
}

/** Escapes text for a single-line ASS dialogue field. */
function assText(text: string): string {
  return hardSpaces(text.replace(/\r/g, '').replace(/\n/g, '\\N'));
}

/** Escapes a path for use inside an ffmpeg filter argument. */
function escapeFilterPath(path: string): string {
  return path.replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "\\'");
}

/**
 * Resolves the font for on-screen text: the configured family if there is one,
 * otherwise the first preference fontconfig can actually resolve.
 */
async function resolveFont(
  adv: ClipAdvancedConfig,
  onLog?: (line: string) => void
): Promise<string> {
  if (adv.fontFamily.trim()) return adv.fontFamily.trim();

  // Deployments pin a font they know is installed, which skips the guesswork.
  const pinned = process.env.CLIP_FONT_FAMILY?.trim();
  if (pinned) return pinned;

  for (const family of FONT_PREFERENCES) {
    try {
      const { stdout } = await execFileAsync('fc-match', ['-f', '%{family}', family]);
      // fc-match always returns *something*, so compare rather than trust success.
      if (stdout.split(',').some((f) => f.trim().toLowerCase() === family.toLowerCase())) {
        return family;
      }
    } catch {
      // fontconfig missing entirely — fall through to the last resort.
      break;
    }
  }

  // Worth shouting about: libass cannot resolve "sans-serif" on a box with no
  // fonts, so the render still succeeds and simply has no text on it. Set
  // CLIP_FONT_FAMILY or install fontconfig plus a font package.
  onLog?.('WARNING: no configured font resolved — captions may not render');
  return 'sans-serif';
}

/**
 * How much of a source's progress the loudness measurement accounts for.
 *
 * The measurement decodes the whole file without encoding, so it's quicker than
 * the encode that follows but far from free — roughly a quarter, measured on a
 * 1080p30 clip. Splitting the share keeps the bar moving through both.
 */
const LOUDNORM_SHARE = 0.25;

/**
 * Measures a clip and returns a two-pass (linear) loudnorm filter string, or
 * null when the clip is effectively silent.
 *
 * Measuring first keeps the gain linear and preserves dynamics; single-pass
 * "dynamic" mode pumps and over-loudens. Clips below the floor are skipped
 * because normalising near-silence just amplifies hiss.
 */
async function loudnormFilter(
  path: string,
  adv: ClipAdvancedConfig,
  onProgress?: (fraction: number) => void
): Promise<string | null> {
  const targets = `I=${adv.loudnormTarget}:TP=${adv.loudnormTruePeak}:LRA=${adv.loudnormRange}`;

  const duration = onProgress ? await probeDuration(path).catch(() => 0) : 0;

  let output: string;
  try {
    // loudnorm's JSON report goes to stderr, and ffmpeg exits non-zero on some
    // inputs even after printing it, so read the log either way.
    output = await runFfmpeg(
      ['-i', path, '-af', `loudnorm=${targets}:print_format=json`, '-f', 'null', '-'],
      { totalDuration: duration || undefined, onProgress }
    );
  } catch (e) {
    output = e instanceof Error ? e.message : '';
  }

  const read = (key: string): string | null => {
    const match = new RegExp(`"${key}"\\s*:\\s*"?([^",\\s]+)"?`).exec(output);
    return match ? match[1] : null;
  };

  const inputI = read('input_i');
  if (!inputI || /inf|nan/i.test(inputI)) return null; // silent or unmeasurable
  if (Number(inputI) < adv.loudnormFloor) return null;

  const tp = read('input_tp');
  const lra = read('input_lra');
  const thresh = read('input_thresh');
  const offset = read('target_offset');

  // Parse failed — fall back to a safe single pass rather than skipping.
  if (!tp || !lra || !thresh || !offset) {
    return `loudnorm=${targets}`;
  }

  return (
    `loudnorm=${targets}:measured_I=${inputI}:measured_TP=${tp}` +
    `:measured_LRA=${lra}:measured_thresh=${thresh}:offset=${offset}:linear=true`
  );
}

/**
 * The fill filter: normalises [0:v] to the output frame.
 *
 * force_divisible_by=2 keeps scaled dimensions even so the centred overlay/pad
 * lands on whole pixels — an odd width put the seam on a half-pixel and
 * produced a yuv420 chroma fringe at the footage edge.
 */
/**
 * The filter that turns a source upright, as a fragment to append to a chain.
 *
 * Applied before anything measures the frame, because everything downstream —
 * the fill, the scale, the crop — reasons about width and height, and turning
 * the picture after they've decided would leave the answer they arrived at
 * pointing the wrong way.
 *
 * `transpose` handles the quarter turns; 180 is two flips instead, which costs
 * one pass rather than two and needs no intermediate buffer. Anything that
 * isn't a right angle is dropped rather than rounded: this exists to correct an
 * orientation, and a value that isn't one of the four is a bug upstream, not an
 * instruction.
 */
function rotateFilter(rotation: number | null | undefined): string {
  // Wrapped twice: a single `% 360` keeps the sign, so -90 stays -90.
  switch ((((rotation ?? 0) % 360) + 360) % 360) {
    case 90:
      return ',transpose=1';
    case 180:
      return ',hflip,vflip';
    case 270:
      return ',transpose=2';
    default:
      return '';
  }
}

function buildFill(
  fill: string,
  width: number,
  height: number,
  adv: ClipAdvancedConfig,
  rotation?: number | null,
  /** The footage's displayed size, so a fill that would be invisible is skipped. */
  source?: { width: number; height: number },
  /** This shot's own framing: how far in it sits, and whether it drifts. */
  framing?: { zoom: number; pan: boolean; seconds: number }
): string {
  const head = `[0:v]fps=${adv.fps},setpts=PTS-STARTPTS${rotateFilter(rotation)}`;

  /*
   * Does the footage already fill the frame?
   *
   * Phone video shot for this and a clip rendered at 9:16 are the same shape,
   * which is the common case, and a fill has nothing to do in it: there are no
   * bars to put anything in. `crop` is what that reduces to — with matching
   * aspects it crops nothing and is a plain scale — and it can't produce a
   * black bar if the two are a hair apart, which `black` could.
   */
  const fills = alreadyFills({ width, height }, source, rotation);

  if (fill === 'black' && !fills) {
    return (
      `${head},scale=${width}:${height}:force_original_aspect_ratio=decrease` +
      `:force_divisible_by=2,setsar=1,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black[filled]`
    );
  }

  /*
   * Also the answer for footage that already fits, whatever was asked for.
   *
   * A blurred background under a picture that covers every pixel of it is a
   * boxblur nobody will ever see — and it costs more than twice as much as the
   * scale it wraps, measured at 14.2s against 6.2s for twenty seconds of
   * 1080x1920. The two produce identical frames here, so this is the same
   * render, faster.
   */
  if (fill === 'crop' || fills) {
    /*
     * Cover, and the only place a drift can happen.
     *
     * This scale makes the picture bigger than the frame and the crop throws
     * the rest away — so this is the one moment the material outside the frame
     * still exists. An effect on the lane runs long after it is gone, which is
     * why panning is a property of the shot and not something the lane can
     * offer.
     *
     * The scale is fixed for the whole shot, so `crop` may read `iw`/`ih` here:
     * it evaluates them once, which is correct precisely because they do not
     * change. (A zoom that moved over time could not use them — see the moves
     * pack, which writes its own sizes out for that reason.)
     */
    const zoom = Math.max(1, framing?.zoom ?? 1);

    /*
     * A drift is done at twice the size and scaled back down.
     *
     * `crop` takes whole pixels, so a slow move advances two and then none —
     * which is what a drift *is*, slow, so it is exactly the case that shows
     * it. Doing the crop on a picture twice as large makes each of those steps
     * half an output pixel, and the scale down turns the remainder into
     * interpolation instead of a jump. It is the standard answer to the same
     * problem in `zoompan`, where the usual advice is to feed it an
     * 8000-wide intermediate for a 1920 output.
     *
     * Two rather than four. Four is smoother again and costs several times the
     * render, and past two there is nothing left to gain on a picture that
     * isn't enormous to begin with — the crop arithmetic improves, the detail
     * does not. Only paid when something actually drifts.
     */
    const drifting = Boolean(framing?.pan);
    const over = drifting ? 2 : 1;
    const zoomed = `scale=${Math.round(width * zoom * over)}:${Math.round(height * zoom * over)}`;
    const cw = width * over;
    const ch = height * over;

    let x = '(iw-ow)/2';
    let y = '(ih-oh)/2';

    if (framing?.pan && source && source.width > 0 && source.height > 0) {
      const turned = turnedSize(source, rotation);
      // What `force_original_aspect_ratio=increase` will settle on.
      const factor = Math.max((width * zoom) / turned.width, (height * zoom) / turned.height);
      const room = { x: turned.width * factor - width, y: turned.height * factor - height };
      const drift = driftWindow(room, width, framing.seconds);

      if (drift) {
        const span = Math.max(0.05, framing.seconds);
        const p = `clip(t/${span.toFixed(3)},0,1)`;
        const at = `(${drift.from.toFixed(4)}+${(drift.to - drift.from).toFixed(4)}*${p})`;
        if (drift.axis === 'x') x = `(iw-ow)*${at}`;
        else y = `(ih-oh)*${at}`;
      }
    }

    // Back to the frame after the crop, which is where the half-pixels become
    // interpolation. A no-op when nothing is drifting and `over` is 1.
    const down = over > 1 ? `,scale=${width}:${height}` : '';
    return (
      `${head},${zoomed}:force_original_aspect_ratio=increase` +
      `:force_divisible_by=2,crop=${cw}:${ch}:'${x}':'${y}'${down},setsar=1[filled]`
    );
  }

  // Blurred fill: the footage sits over a blown-up, blurred copy of itself.
  return (
    `${head},split=2[a][b];` +
    `[a]scale=${width}:${height}:force_original_aspect_ratio=increase:force_divisible_by=2,` +
    `crop=${width}:${height},boxblur=${adv.blurStrength}:3,setsar=1[bg];` +
    `[b]scale=${width}:${height}:force_original_aspect_ratio=decrease:force_divisible_by=2,setsar=1[fg];` +
    `[bg][fg]overlay=(W-w)/2:(H-h)/2[filled]`
  );
}

interface AssContext {
  width: number;
  height: number;
  config: ClipRenderConfig;
  adv: ClipAdvancedConfig;
  font: string;
  accentColor: string;
}

/**
 * Builds the .ass subtitle file carrying the timed captions.
 *
 * Two styles share one look — Cap (lower-third) and Head (big)
 * and Head (big, centred). A caption uses Head when it is flagged as one.
 */
export function buildAss(ctx: AssContext, captions: TimedCaption[]): string {
  const { width, height, config, adv, font, accentColor } = ctx;

  const capSize = Math.round(width / CAPTION_SIZE_DIVISOR);

  /*
   * Where the style puts a caption, before any caption says otherwise.
   *
   * Every line overrides this with its own `MarginV` and `\an2`, so it is only
   * the fallback — but it comes from the same table the anchor button writes
   * to, measured from the same edge. These used to be their own numbers here,
   * 8% down for top and 24% up for bottom, and an anchored caption and an
   * unanchored one at the same setting landed in different places.
   */
  const anchorId = 'bottom';
  const alignment = 2;
  const marginV = Math.round(
    height * (captionAnchors(adv).find((a) => a.id === anchorId)?.y ?? 0.18)
  );

  // What a caption is drawn in unless it carries its own; each line states its
  // colour anyway, so this is what an empty style would fall back to.
  const primary = config.colorizeCaption ? assColor(accentColor) : '&H00FFFFFF';

  /*
   * A style per voice per backdrop, because ASS has no inline tag for a panel.
   *
   * Colour and height are stated on the line itself, so a caption can differ
   * from its neighbours without a style of its own. The panel can't be: it is
   * `BorderStyle`, which lives on the style and nowhere else. So the backdrops
   * the captions actually ask for are collected first, and each line names the
   * style for the one it wanted — two clips' worth of captions in one colour
   * still make one style. The one exception is the panel-less pair, which is
   * written whenever an effect has copies to draw even if no caption asked for
   * a bare look itself.
   *
   * BorderStyle 3 draws the panel; 1 is outline and shadow. The heavier outline
   * is what gives the panel its padding, and the big voice takes one more pixel
   * of it than the normal one.
   */
  /*
   * Everything about a caption that a style depends on, worked out before any
   * style is written.
   *
   * The backdrops used to be collected on their own in a loop here, which
   * effects make too early. An effect can put extra copies of the words
   * underneath the caption — a colour split is three copies a few pixels apart,
   * because libass has no other way to draw one — and a copy must not draw the
   * panel a second time. With BorderStyle 3 that is exactly what pointing it at
   * `Cap0` would do: one dark box per copy, stacked. So the copies need a
   * panel-less style to name, and whether such a style has to exist can only be
   * known after asking the effects what they intend to draw.
   */
  const drawn = captions
    .filter((caption) => captionText(caption.text ?? '').trim())
    .map((caption) => {
      const backdrop = captionBackdrop(caption, config);
      const color = captionColor(caption, config, accentColor);
      /*
       * A caption with a height of its own overrides the clip's.
       *
       * The Dialogue format has carried per-line margins all along — they were
       * `0,0,0`, which means "use the style's". Setting MarginV places this
       * line and no other, so several captions can sit at several heights in
       * the same second, which is the whole point of asking.
       */
      const marginV = Math.round(Math.min(1, Math.max(0, captionY(caption, adv))) * height);
      const { effect, params } = captionEffectOf(caption, config);
      return {
        caption,
        backdrop,
        color,
        marginV,
        ass: effect.ass({
          params,
          duration: Math.max(0, caption.end - caption.start),
          width,
          height,
          color,
          backdrop,
          seed: captionSeed(caption),
          // `\move` counts down from the top; MarginV counts up from the bottom.
          y: height - marginV
        })
      };
    });

  /*
   * One style per panel, where a panel is a colour *and* how solid it is.
   *
   * Opacity used to be a single clip-wide dial, so the colour alone named a
   * style. It is a caption's own now — white at half strength is grey, and
   * that belongs beside the colour rather than three panels away — which makes
   * two captions on the same colour at different strengths two different
   * panels. Keyed on the pair, and `null` is the no-panel style.
   */
  type Panel = { colour: string | null; opacity: number };
  const panelKey = (p: Panel) => (p.colour ? `${p.colour}@${p.opacity}` : 'none');

  const backdrops: Panel[] = [];
  for (const item of drawn) {
    const panel: Panel = {
      colour: item.backdrop,
      opacity: captionBackdropOpacity(item.caption)
    };
    if (!backdrops.some((p) => panelKey(p) === panelKey(panel))) backdrops.push(panel);
  }
  const hasCopies = drawn.some((item) => item.ass.copies?.length);
  /*
   * A caption wanting both a panel and a ring is drawn as two lines, and the
   * upper one needs the plain style to carry the ring. Without this the style
   * simply wasn't in the table when every caption had a panel, and the line
   * named `Cap-1` — which libass skips, so the words vanished and the box
   * stayed.
   */
  const needsBare = drawn.some((item) => item.backdrop && captionBorder(item.caption, config));
  const none: Panel = { colour: null, opacity: 0 };
  if (backdrops.length === 0 || ((hasCopies || needsBare) && !backdrops.some((p) => !p.colour))) {
    backdrops.push(none);
  }

  /*
   * `BackColour` is `&HAABBGGRR`, where the alpha runs the other way from the
   * one anybody expects: 00 is solid and FF is invisible. So the dial, which
   * asks how solid the panel is, is inverted on the way in.
   */
  const veil = (opacity: number) =>
    Math.round((1 - Math.min(100, Math.max(0, opacity)) / 100) * 255)
      .toString(16)
      .padStart(2, '0')
      .toUpperCase();

  /*
   * The panel's colour goes in `OutlineColour`, not `BackColour`.
   *
   * This is the one genuinely counter-intuitive thing about BorderStyle 3. The
   * field named after the background is the *shadow* colour; the box itself is
   * painted with the outline colour, because with an opaque box there is no
   * outline left for that field to describe. Checked rather than remembered:
   * given a red outline and a half-transparent green background, libass draws
   * the box red and the green appears nowhere in the frame.
   *
   * It used to be the other way round here, which meant a caption backdrop came
   * out solid black whatever colour was picked, and `captionBackdropPercent` —
   * the dial that asks how solid the panel is — changed nothing at all. The
   * editor's overlay honoured both, so the preview was right and the file was
   * wrong, which is the exact failure the shared caption helpers exist to stop.
   */
  const styleLine = (name: string, size: number, backdrop: Panel, extraOutline = 0) => {
    const colour = backdrop.colour;
    const panel = colour ? `&H${veil(backdrop.opacity)}${assColor(colour).slice(4)}` : null;
    return (
      `Style: ${name},${font},${size},${primary},${panel ?? '&H00000000'},&H00000000,1,` +
      `${colour ? 3 : 1},${(colour ? 8 : 4) + extraOutline},${colour ? 0 : 2},` +
      `${alignment},${adv.captionMarginX},${adv.captionMarginX},${marginV}`
    );
  };

  const lines: string[] = [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${width}`,
    `PlayResY: ${height}`,
    'WrapStyle: 0',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, OutlineColour, BackColour, Bold,' +
      ' BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV',
    /*
     * One style per panel, and nothing else.
     *
     * There was a second, identical table at a bigger size for captions marked
     * `headline` — the aA switch. Captions carry a real size in their own
     * markup now, so the flag has nothing left to decide and every line is a
     * Cap. Half the styles, and no question about which of two tables a line
     * is on.
     */
    ...backdrops.map((backdrop, i) => styleLine(`Cap${i}`, capSize, backdrop)),
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text'
  ];

  for (const { caption, backdrop, color, marginV, ass } of drawn) {
    const voice = 'Cap';
    const mine = panelKey({ colour: backdrop, opacity: captionBackdropOpacity(caption) });
    const style = `${voice}${backdrops.findIndex((p) => panelKey(p) === mine)}`;

    /*
     * `\an2` because MarginV is measured from whichever edge the alignment
     * anchors to. Without it, the same number would mean "up from the bottom"
     * on one clip and "down from the top" on another.
     */
    const anchor = '{\\an2}';

    /*
     * Stated per line rather than left to the style.
     *
     * `\1c` takes `&HBBGGRR&` where the style's `PrimaryColour` takes an alpha
     * pair as well, so the two spellings of one colour are not interchangeable
     * — hence the slice rather than a second formatter.
     */
    /*
     * The words' colour, and the ring around them.
     *
     * Inline rather than in the style, because both are a caption's own
     * business and the styles are shared by every caption that sits on the
     * same kind of panel. `\3c` is the outline colour; `\bord0` is a caption
     * that asked for no ring — which only means anything on the plain style,
     * since a panel is drawn *with* the outline and taking it away would take
     * the panel with it.
     */
    const ring = captionBorder(caption, config);
    const outline = ring
      ? `{\\3c&H${assColor(ring).slice(4)}&\\bord${captionBorderWidth(caption, config)}}`
      : '{\\bord0}';
    /*
     * The face, when this line wants one the style doesn't carry.
     *
     * Inline `\fn` rather than a style per font: a style is a row in a table
     * and the table is already multiplied by every backdrop colour in the
     * clip. One override on the line is what libass gives you for exactly
     * this, and it resolves the same way the style's own Fontname does — out
     * of the directory handed to the filter.
     */
    const own = captionFontId(caption, config);
    const face = own && fontById(own)?.name !== font ? `{\\fn${fontById(own)?.name}}` : '';
    const colour = `{\\1c&H${assColor(color).slice(4)}&}${outline}${face}`;
    // The caption's own size is what a `</span>` returns to, so the parser is
    // told it rather than left to guess from the style it happens to be on.
    const text = hardSpaces(captionAss(caption.text, capSize));
    const copies = ass.copies ?? [];

    /*
     * A copy is moved sideways with the margins rather than with `\pos`, so
     * that it wraps where the caption it is a copy of wraps. Alignment 2
     * centres the block between MarginL and MarginR, so widening one by what
     * the other loses shifts the centre by that much and leaves the available
     * width — and therefore every line break — exactly as it was.
     */
    for (const copy of copies) {
      const left = Math.max(0, Math.round(adv.captionMarginX + (copy.dx ?? 0)));
      const right = Math.max(0, Math.round(adv.captionMarginX - (copy.dx ?? 0)));
      const start = caption.start + (copy.from ?? 0);
      const end = copy.to != null ? caption.start + copy.to : caption.end;
      if (end <= start) continue;
      lines.push(
        `Dialogue: ${copy.layer},${assTime(start)},${assTime(end)},` +
          `${voice}${backdrops.findIndex((p) => !p.colour)},,` +
          `${left},${right},${marginV},,${anchor}{${copy.tags}}${text}`
      );
    }

    // The words themselves, above whatever the effect put underneath them —
    // unless it asked for otherwise, which is what a caption on a panel needs.
    const layer = ass.layer ?? copies.reduce((top, copy) => Math.max(top, copy.layer + 1), 0);
    /*
     * Off centre, by the margins rather than by `\pos`.
     *
     * Alignment 2 centres the block between MarginL and MarginR, so widening
     * one by what the other loses moves the centre by that much and leaves the
     * available width — and therefore every line break — exactly as it was.
     * The same trick the split copies use a few lines up, and the reason a
     * caption nudged sideways still wraps where it did.
     */
    const dx = Math.round(captionX(caption) * width);
    const marginL = Math.max(0, Math.round(adv.captionMarginX + dx));
    const marginR = Math.max(0, Math.round(adv.captionMarginX - dx));

    /*
     * A panel and an outline, which one style cannot carry.
     *
     * BorderStyle 3 paints the box with the outline colour, so there is no
     * outline left for that style to draw — white panel, yellow words and a
     * black ring is three things and the style has room for two. Two lines
     * then: the panelled style underneath with its words made invisible, so
     * only the box survives, and the plain style over it carrying the colour
     * and the ring.
     *
     * Same text, same margins, same alignment, same tags — so the box is
     * exactly the size of the words it sits behind, wraps where they wrap, and
     * any fade or move takes the pair together. Only when both are asked for;
     * one of either is still one line.
     */
    const stacked = Boolean(backdrop) && Boolean(ring);
    const bare = `${voice}${backdrops.findIndex((p) => !p.colour)}`;
    const tags = ass.tags ? `{${ass.tags}}` : '';

    /*
     * The pair is placed outright, which is what keeps it a pair.
     *
     * libass shuffles un-positioned lines apart when they would overlap, and a
     * box with words on top of it is nothing but an overlap — so it moved the
     * words a whole line up and left the box behind. Worse, it counted lines
     * that had already finished: the same two lines rendered on their own sat
     * correctly, and only went wrong once an effect's earlier copies were in
     * the file with them. A line given `\pos` is exempt.
     *
     * The point is where the margins already put it — the centre of what's
     * left between them, at the same height `MarginV` means — so this moves
     * nothing. Measured against the margin-only version on a caption long
     * enough to wrap: identical rows, identical columns, identical breaks.
     */
    const place = stacked
      ? `\\pos(${Math.round((marginL + (width - marginR)) / 2)},${height - marginV})`
      : '';

    if (stacked) {
      lines.push(
        `Dialogue: ${layer},${assTime(caption.start)},${assTime(caption.end)},${style},,` +
          `${marginL},${marginR},${marginV},,` +
          /*
           * The fill only.
           *
           * `\1a&HFF&` makes the glyphs invisible while still laying them out,
           * which is what gives the box its shape. The outline alpha is left
           * alone on purpose: under BorderStyle 3 the outline *is* the box, so
           * hiding it hides the panel. Measured rather than reasoned — with
           * `\3a&HFF&` as well the rendered frame came back with no white
           * pixels in it at all.
           */
          `{\\an2${place}}{\\1a&HFF&}${tags}${text}`
      );
    }

    lines.push(
      `Dialogue: ${stacked ? layer + 1 : layer},${assTime(caption.start)},` +
        `${assTime(caption.end)},${stacked ? bare : style},,` +
        `${marginL},${marginR},${marginV},,` +
        `${stacked ? `{\\an2${place}}` : anchor}${colour}${tags}${text}`
    );
  }

  return lines.join('\n') + '\n';
}

/**
 * Renders one source clip to a normalised part file.
 *
 * The first clip carries the intro branding when enabled: the big logo is
 * present at full opacity from frame 1 (so the platform thumbnail is branded,
 * since TikTok/Shorts/Reels grab frame 1 as the cover), fades out, and only
 * then does the corner watermark fade in and stay. Only one logo on screen at
 * a time.
 */
async function renderPart(
  source: ClipSourceInput,
  index: number,
  ctx: {
    tmp: string;
    config: ClipRenderConfig;
    adv: ClipAdvancedConfig;
    width: number;
    height: number;
    signal?: AbortSignal;
    onLog?: (line: string) => void;
    /** 0..1 within this source; the caller maps it onto the overall bar. */
    onProgress?: (fraction: number) => void;
  }
): Promise<string> {
  const { tmp, config, adv, width, height } = ctx;
  const partPath = join(tmp, `${String(index + 1).padStart(2, '0')}_part.mp4`);

  // Footage-only effects, ordered: speed -> zoom -> grade -> vignette -> grain.
  // Captions are burned later in the libass pass, not here.
  const effects: string[] = [];
  const speedOn = config.speed !== 1;
  if (speedOn) effects.push(`setpts=PTS/${config.speed}`);
  if (config.zoom) {
    effects.push(
      `zoompan=z='min(zoom+${adv.zoomRate},${adv.zoomMax})':d=1` +
        `:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${width}x${height}:fps=${adv.fps}`
    );
  }
  const tone = TONE_FILTERS[config.tone];
  if (tone) effects.push(tone);
  if (config.vignette) effects.push('vignette');
  if (config.grain) effects.push(`noise=alls=${adv.grainStrength}:allf=t`);
  // The processed look is deliberately not here; see the final pass. It needs
  // the clip's own clock, and in here every shot starts again at zero.

  const chain = effects.length ? effects.join(',') : 'null';
  const still = Boolean(source.still);
  /*
   * How long the still is held, which is the whole of its length.
   *
   * Footage has a duration in the file and a trim window cut out of it; a
   * picture has neither, so the window *is* the length rather than a selection
   * from one. `placeSource` therefore always writes a window for a still, and
   * this is the one place that would otherwise divide by nothing.
   */
  const stillSeconds =
    source.trimStart != null && source.trimEnd != null
      ? Math.max(0.1, source.trimEnd - source.trimStart)
      : DEFAULT_STILL_SECONDS;

  /*
   * Read here rather than further down, because the fill wants to know whether
   * the footage already covers the frame before it decides to build one.
   *
   * ffprobe answers for a still too — width and height are what the fill needs
   * — but its duration is a single frame and it has no audio, so both are
   * replaced rather than trusted.
   */
  const probed = await probeVideo(source.path);
  const probe = still ? { ...probed, duration: stillSeconds, hasAudio: false } : probed;
  const fill = buildFill(
    source.fit ?? config.fill,
    width,
    height,
    adv,
    source.rotation,
    probe,
    // The shot's own framing. `partDuration` is not known yet, so the length is
    // worked out the same way it is below — a drift is paced by how long the
    // shot is held, not by how long the file happens to be.
    {
      zoom: source.zoom ?? 1,
      pan: Boolean(source.pan),
      seconds: still
        ? stillSeconds
        : source.trimStart != null && source.trimEnd != null
          ? Math.max(0, source.trimEnd - source.trimStart)
          : probe.duration
    }
  );
  // Per-clip watermark override, falling back to the project setting.
  /*
   * No branding here any more; see the final pass.
   *
   * The logo and the watermark used to be composited onto each part, which made
   * them properties of a piece of footage rather than of the clip. With
   * placements that is plainly wrong: a timeline whose first shot lands fifteen
   * seconds in got its opening logo fifteen seconds in, and the watermark
   * blinked out over every gap, because there was no part underneath to carry
   * it. They belong on the finished picture, at the times the clip says.
   */
  const silentIndex = 1;

  /*
   * Trim on the input side (fast seek); it's re-encoded downstream so it stays
   * accurate.
   *
   * A still has nothing to seek into. `-loop 1` repeats the one frame forever
   * and `-t` says when to stop, which is the same pair the logo and watermark
   * already use — so the part comes out as a piece of video of exactly the
   * length the block was dragged to.
   */
  const seek: string[] = [];
  if (still) {
    seek.push('-loop', '1', '-t', stillSeconds.toFixed(3));
    ctx.onLog?.(`Still: clip ${index + 1} held ${stillSeconds.toFixed(2)}s`);
  } else if (source.trimStart != null && source.trimEnd != null) {
    const duration = source.trimEnd - source.trimStart;
    if (duration > 0) {
      seek.push('-ss', String(source.trimStart), '-t', duration.toFixed(3));
      ctx.onLog?.(`Trim: clip ${index + 1}  ${source.trimStart}s → ${source.trimEnd}s`);
    }
  }

  // A muted clip gets a silent track rather than no track: it still feeds the
  // music bed's sidechain, so the bed stays full over it instead of ducking.
  const silent = Boolean(source.muted) || !probe.hasAudio;
  if (source.muted) ctx.onLog?.(`Mute: clip ${index + 1} (music stays full here)`);
  if (source.rotation) ctx.onLog?.(`Rotate: clip ${index + 1} ${source.rotation}°`);

  const audioFilters: string[] = [];
  if (!silent) {
    if (speedOn) audioFilters.push(`atempo=${config.speed}`);
    if (config.loudnorm) {
      // The measurement pass decodes the whole file before the encode starts.
      // Without this the bar would sit still for its entire duration.
      const ln = await loudnormFilter(source.path, adv, (f) =>
        ctx.onProgress?.(f * LOUDNORM_SHARE)
      );
      if (ln) audioFilters.push(ln);
    }
  }

  /*
   * How long this part is meant to be, decided here rather than inferred.
   * A still is held for its window; footage is its trim, or the whole file.
   */
  const partLength = still
    ? stillSeconds
    : source.trimStart != null && source.trimEnd != null
      ? Math.max(0, source.trimEnd - source.trimStart)
      : probe.duration;

  /*
   * This shot's own look, between the fill and the clip-wide filters.
   *
   * After the fill, because an effect works on the framed picture rather than
   * on whatever shape the footage arrived in; before the clip's grade, so a
   * shot that is black and white still takes the tone the clip is graded to,
   * the way a filter applies over a look in any editor.
   *
   * On this part's own clock, which starts at zero — the one difference from
   * the clip's effects, and the reason this is where they run. A rhythm in an
   * effect means a rhythm through the shot.
   */
  const own = source.effects?.length
    ? pictureGraph(
        { effects: source.effects },
        { width, height, fps: adv.fps, duration: partLength },
        '[filled]',
        '[own]'
      )
    : [];

  // Statements, not one chain: an effect may branch to ruin a strip of the
  // picture and composite it back, which is more than a comma can express.
  const filterGraph = own.length
    ? `${fill};${own.join(';')};[own]${chain}[v]`
    : `${fill};[filled]${chain}[v]`;

  const args: string[] = ['-y', '-loglevel', 'error', ...seek, '-i', source.path];

  let audioMap: string;
  if (silent) {
    args.push('-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000');
    audioMap = `${silentIndex}:a`;
  } else {
    audioMap = '0:a';
  }

  /*
   * Padded with silence rather than letting the shorter stream decide.
   *
   * `-shortest` below cuts the output at whichever stream runs out first, and
   * on a file whose audio track is shorter than its picture — which plenty of
   * cameras and screen recordings produce — that stream is the audio. A ten
   * second shot with eight seconds of sound came out eight seconds long, with
   * two seconds of footage simply gone: the strip said one length, the render
   * was another, and scrubbing stopped dead partway along with nothing to
   * explain it.
   *
   * `apad` pads forever and `-shortest` then stops at the end of the picture,
   * which is the pair ffmpeg intends for exactly this. Last in the chain, so it
   * pads what the speed change and the loudness pass produced rather than
   * something they are about to alter.
   */
  if (!silent) audioFilters.push('apad');

  args.push('-filter_complex', filterGraph);
  if (audioFilters.length) args.push('-af', audioFilters.join(','));
  args.push('-map', '[v]', '-map', audioMap);
  // -shortest cuts at the end of the picture: the silence and the `apad` above
  // both run forever, so something has to say when the part stops.
  /*
   * Bounded on the way out as well as on the way in.
   *
   * `-shortest` stops at whichever stream ends first, and with `apad` above the
   * audio never ends — so the picture is meant to decide. It does, until
   * `loudnorm` is in the chain: it runs a lookahead buffer and flushes it when
   * the input stops, so its output is *longer* than what it was given. Measured
   * on a 1.5s trim: 1.514s of audio without it, 1.984s with. The part then
   * reports 1.98s to `probeDuration`, and because that is what the clip's whole
   * length is worked out from, half a second of audio over no picture became
   * the clip's own duration — a shot whose block on the strip said 1.5.
   *
   * `-t` says how long the part is, which is a thing this function already
   * knows and was leaving for ffmpeg to infer.
   */
  const bound = partLength > 0 ? ['-t', partLength.toFixed(3)] : [];
  args.push('-shortest', ...bound, ...encodeArgs(adv), partPath);

  // Trimmed length if set, otherwise the source's own — ffmpeg reports elapsed
  // output time, which only becomes a fraction against the expected total.
  const partDuration = partLength;

  const encodeShare = config.loudnorm && !silent ? 1 - LOUDNORM_SHARE : 1;
  const encodeBase = 1 - encodeShare;

  await runFfmpeg(args, {
    signal: ctx.signal,
    totalDuration: partDuration || undefined,
    onProgress: (fraction) => ctx.onProgress?.(encodeBase + fraction * encodeShare)
  });
  return partPath;
}

/** Renders the graphic card used for the end card and the outro dissolve. */
async function renderCard(
  tmp: string,
  name: string,
  seconds: number,
  width: number,
  height: number,
  fadeIn: boolean,
  adv: ClipAdvancedConfig,
  signal?: AbortSignal
): Promise<string> {
  const output = join(tmp, name);
  // ffmpeg's color source wants 0xRRGGBB, the config stores #RRGGBB.
  const background = adv.cardBackground.replace(/^#/, '0x');
  const overlay = fadeIn
    ? `[2:v]format=rgba,fade=t=in:st=0:d=${Math.max(0.01, adv.markFadeSeconds).toFixed(
        2
      )}:alpha=1[lg];` + `[0:v][lg]overlay=(W-w)/2:(H-h)/2:${OVERLAY_STILL}[v]`
    : `[0:v][2:v]overlay=(W-w)/2:(H-h)/2:${OVERLAY_STILL}[v]`;

  await runFfmpeg(
    [
      '-y',
      '-loglevel',
      'error',
      '-f',
      'lavfi',
      '-i',
      `color=c=${background}:s=${width}x${height}:r=${adv.fps}:d=${seconds}`,
      '-f',
      'lavfi',
      '-i',
      'anullsrc=channel_layout=stereo:sample_rate=48000',
      '-loop',
      '1',
      '-i',
      join(tmp, 'card.png'),
      '-filter_complex',
      overlay,
      '-map',
      '[v]',
      '-map',
      '1:a',
      '-t',
      String(seconds),
      ...encodeArgs(adv),
      '-shortest',
      output
    ],
    { signal }
  );

  return output;
}

/** Joins parts with hard cuts (concat) or crossfade dissolves. */
/**
 * Whether the placements are a plain sequence — each starting where the one
 * before it ended, all in one lane.
 *
 * Worth asking because the answer decides between two very different stages. A
 * sequence can be joined with the concat demuxer, which is a stream copy;
 * anything else has to be composited, which re-encodes. Every clip made before
 * placements existed is a sequence, and most made after one will be too, so
 * this keeps the cheap path for the common case rather than making everything
 * pay for what only some clips use.
 */
function isSequential(sources: ClipSourceInput[], lengths: number[]): boolean {
  let at = 0;
  for (const [index, source] of sources.entries()) {
    if ((source.lane ?? 0) !== 0) return false;
    /*
     * A fade needs something to fade over, and concat has no overlay to do it
     * with — the parts are stream-copied end to end. So any fade sends the clip
     * down the composite path, which costs some compositing and buys a fade
     * that can dissolve into whatever is underneath it.
     */
    if (source.fadeIn || source.fadeOut) return false;
    if (Math.abs((source.start ?? at) - at) > 0.05) return false;
    at += lengths[index];
  }
  return true;
}

/**
 * Lays the parts onto a canvas at the times they were placed.
 *
 * Concat can only say "then"; this says "at". Gaps come out black and silent,
 * because a gap is something someone drew rather than an accident to be closed
 * up, and overlaps are resolved by lane — the higher one covers the lower.
 *
 * Each part is shifted with `setpts` rather than trimmed into position, so the
 * footage is untouched and only its timing moves. `enable` keeps it from
 * showing outside its own window, which `eof_action=pass` alone would not.
 *
 * Returns the graph rather than running it. Laying out, dissolving into the
 * outro and burning the captions were three encodes of every frame to produce
 * one file, and each one threw away a little more of the picture on the way.
 * They are one pass now, and this is the first fragment of it.
 */
function compositeGraph(
  parts: string[],
  sources: ClipSourceInput[],
  lengths: number[],
  width: number,
  height: number,
  adv: ClipAdvancedConfig,
  /** Never shorter than this, whatever the footage does. See `contentEnd`. */
  floor = 0
): { inputs: string[]; graph: string[]; video: string; audio: string; duration: number } {
  const placed = parts
    .map((path, index) => ({
      path,
      start: sources[index]?.start ?? 0,
      lane: sources[index]?.lane ?? 0,
      length: lengths[index],
      fadeIn: Boolean(sources[index]?.fadeIn),
      fadeOut: Boolean(sources[index]?.fadeOut)
    }))
    .sort((a, b) => a.lane - b.lane || a.start - b.start);

  const duration = placed.reduce((furthest, p) => Math.max(furthest, p.start + p.length), floor);

  const inputs = [
    // The canvas everything lands on, and the silence everything mixes into.
    '-f',
    'lavfi',
    '-i',
    `color=black:size=${width}x${height}:rate=${adv.fps}:d=${duration.toFixed(3)}`,
    '-f',
    'lavfi',
    '-i',
    `anullsrc=r=48000:cl=stereo:d=${duration.toFixed(3)}`
  ];
  for (const p of placed) inputs.push('-i', p.path);

  const graph: string[] = [];
  const beds: string[] = ['[1:a]'];
  let picture = '[0:v]';

  placed.forEach((p, index) => {
    const input = index + 2;
    const at = p.start.toFixed(3);
    const until = (p.start + p.length).toFixed(3);
    const delay = Math.round(p.start * 1000);

    /*
     * Fades on opacity, not on brightness.
     *
     * `alpha=1` makes `fade` work on the alpha channel, so the shot arrives and
     * leaves by becoming transparent rather than by going black — and what is
     * underneath decides what that looks like. Over the canvas it reads as a
     * fade from black, because the canvas is black. Over another shot it
     * dissolves into it, which means a crossfade is two blocks overlapping on
     * the strip rather than a separate kind of thing to learn.
     *
     * It has to happen here rather than in `renderPart`, because a part is an
     * H.264 file and H.264 has no alpha to carry. Which is also why a clip with
     * any fade on it is never treated as a sequence: `isSequential` refuses,
     * and the composite path is the only one with an `overlay` to fade into.
     */
    const fades: string[] = [`setpts=PTS+${at}/TB`];
    if (p.fadeIn || p.fadeOut) {
      fades.push('format=rgba');
      const span = Math.max(0.05, Math.min(adv.clipFadeSeconds, p.length / 2));
      if (p.fadeIn) fades.push(`fade=t=in:st=${at}:d=${span.toFixed(2)}:alpha=1`);
      if (p.fadeOut) {
        const from = p.start + p.length - span;
        fades.push(`fade=t=out:st=${from.toFixed(3)}:d=${span.toFixed(2)}:alpha=1`);
      }
    }

    graph.push(`[${input}:v]${fades.join(',')}[pv${index}]`);
    graph.push(
      `${picture}[pv${index}]overlay=eof_action=pass:enable='between(t,${at},${until})'[pc${index}]`
    );
    picture = `[pc${index}]`;

    graph.push(`[${input}:a]adelay=${delay}|${delay},aformat=channel_layouts=stereo[pa${index}]`);
    beds.push(`[pa${index}]`);
  });

  graph.push(`${beds.join('')}amix=inputs=${beds.length}:duration=first:normalize=0[pao]`);

  return { inputs, graph, video: picture, audio: '[pao]', duration };
}

/**
 * Parts, end to end.
 *
 * It used to be able to crossfade them here, and that is why it no longer
 * does: ffmpeg's `xfade` consumes the overlap, so a joined body came out
 * shorter than the clip the captions, the beds and the queue were all timed
 * against — every caption after the first join played late, by the length of
 * the fade, once per join.
 *
 * A dissolve is made at the join instead, out of the frames either side of it
 * (`$lib/clips/joins.ts`): the two shots overlap on the strip and the incoming
 * one fades up, which sends the clip down the composite path where fading into
 * something is what the overlay already does. The clip's length is then what
 * the strip says it is, which is the whole point.
 */
async function joinParts(
  tmp: string,
  parts: string[],
  adv: ClipAdvancedConfig,
  signal?: AbortSignal
): Promise<string> {
  const output = join(tmp, 'joined.mp4');

  // One part is already the joined clip. This used to fall through to the
  // concat demuxer below, which re-encoded the whole thing to produce a copy of
  // its only input — on a single-source clip that was the second most expensive
  // stage of the render, for nothing.
  if (parts.length === 1) return parts[0];

  // concat demuxer: single-quotes in a path would break the list format, and
  // these are our own temp files, so plain interpolation is safe here.
  const listPath = join(tmp, 'list.txt');
  /*
   * Names only, not paths.
   *
   * The concat demuxer resolves each entry relative to the list file, and the
   * staging directory is relative to the working directory — so writing the
   * part's own path produced `data/renders/clip-X/data/renders/clip-X/01.mp4`
   * and the render died with "No such file or directory". Every part is
   * written into `tmp` beside this list, so the basename is the whole of what
   * the demuxer needs.
   *
   * It failed for exactly the clips that took this path: shots laid end to end
   * with no crossfade, which is the default. Anything overlapping or faded went
   * through the composite instead and worked, which is what made it look
   * intermittent.
   */
  await writeFile(listPath, parts.map((p) => `file '${basename(p)}'`).join('\n') + '\n');

  // Stream copy: every part came out of renderPart with identical encoder
  // settings, which is exactly the condition the concat demuxer needs. The
  // final pass re-encodes anyway, so a second encode here bought nothing.
  await runFfmpeg(
    [
      '-y',
      '-loglevel',
      'error',
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      listPath,
      '-c',
      'copy',
      output
    ],
    { signal }
  );
  return output;
}

/**
 * One bed, as the renderer needs it: the track's settings plus where its file is.
 */
export interface ClipAudioInput extends Omit<ClipAudioTrack, 'id' | 'mediaId'> {
  path: string;
}

/** The sidechain that dips a bed under speech in the footage. */
const DUCK = 'sidechaincompress=threshold=0.03:ratio=8:attack=5:release=250';

/**
 * Builds the audio filter graph for a render carrying one or more beds.
 *
 * Each bed is shaped on its own — delayed to its in-point, levelled, faded,
 * ducked if asked — and then everything is summed in one `amix`. Input 0 is the
 * joined footage; the beds follow in the order given, so bed `i` reads from
 * input `i + 1`.
 *
 * Reusing `[0:a]` across several filters is fine, and load-bearing here: input
 * pads are split automatically, unlike the output of a filter, which may only
 * be consumed once.
 */
function buildAudioGraph(
  tracks: ClipAudioInput[],
  config: ClipRenderConfig,
  adv: ClipAdvancedConfig,
  totalDuration: number,
  audioChain: string,
  /**
   * Where the footage's own sound comes from, and which input the first bed is.
   *
   * Both used to be fixed — the clip was always input 0 and the beds followed
   * it — because this ran on a file that had already been made. Now it can also
   * run on a body that is still being composed in the same graph, where the
   * footage audio is a label and the inputs before the beds are a canvas, a
   * silence and every placement.
   */
  clipAudio = '[0:a]',
  bedOffset = 1,
  /**
   * How much time the intro's run-up put in front of the arrangement.
   *
   * A bed is placed against the strip, and the strip starts at the first frame
   * of footage. Push the footage along and the music has to go with it — the
   * picture moved and the sound it was cut to did not, which is a bed a second
   * out of step with the thing it was lined up against.
   */
  lead = 0
): string {
  /*
   * Padded back out to the clip's length before anything else.
   *
   * A bed that stops early leaves the mix short, and `-shortest` on the final
   * pass would then cut the *picture* to where the music ended. Silence is
   * cheap; a truncated video is a broken render.
   */
  const bounded =
    `apad=whole_dur=${totalDuration.toFixed(3)},` +
    `atrim=0:${totalDuration.toFixed(3)},asetpts=N/SR/TB`;
  const tail = (mixed: string) =>
    audioChain ? `${mixed};[amx]${bounded},${audioChain}[a]` : `${mixed};[amx]${bounded}[a]`;

  // A bed under the footage sits back; beds that replaced it are the whole
  // soundtrack and play at full. loudnorm settles the absolute level after.
  const volume = config.musicOnly ? 1 : adv.musicBedVolume;

  /*
   * Copies of the footage audio, one per reader.
   *
   * An input pad like `[0:a]` can be read by as many filters as like; the
   * output of a filter can be read by exactly one, and ffmpeg refuses the whole
   * graph if it is read twice. That difference didn't matter while this only
   * ever ran on a finished file. It does now.
   *
   * Counted rather than predicted: a bed that turns out to be zero-length is
   * dropped below, and an `asplit` with an output nobody reads is refused just
   * as firmly as a label read twice. So each read leaves a token behind, and
   * the split is written at the end once the real number is known.
   */
  let reads = 0;
  const footage = () => `\u0000clip${reads++}\u0000`;

  /** Swaps the tokens for real labels, and writes the split they need. */
  const withFootage = (graph: string): string => {
    /*
     * Nobody wants it, so it has to be thrown away on purpose.
     *
     * When the beds have replaced the footage — which is what muting every clip
     * means — nothing here reads the clip's audio. That was free while it was
     * an input pad, because an input nobody uses simply isn't decoded. It is a
     * filter output now, and a filter output nobody consumes makes ffmpeg
     * refuse the entire graph. `anullsink` is where it goes.
     */
    if (reads === 0) {
      const isInputPad = /^\[\d+:a\]$/.test(clipAudio);
      return isInputPad ? graph : `${clipAudio}anullsink;${graph}`;
    }
    if (reads === 1) return graph.replace(/\u0000clip0\u0000/, clipAudio);
    const copies = Array.from({ length: reads }, (_, i) => `[clipa${i}]`);
    const split = `${clipAudio}asplit=${reads}${copies.join('')}`;
    return `${split};${graph.replace(/\u0000clip(\d+)\u0000/g, (_, i) => copies[Number(i)])}`;
  };

  /*
   * Where each bed actually plays, in timeline order.
   *
   * Sorted because the crossfades below are read off neighbours, and "the next
   * bed" only means anything once they're in the order they'll be heard. The
   * input index travels with each one, since that's fixed by the command line
   * and must not be re-sorted along with them.
   */
  /*
   * The same placement the editor plays, so the music is where it sounded.
   * The input index is attached afterwards: which ffmpeg input a bed came in
   * on is the one part of this the player has no opinion about.
   */
  const placed = placeBeds(tracks, Math.max(0, totalDuration - lead)).map((bed) => ({
    ...bed,
    // Laid out in the strip's time, then moved along with everything else it
    // was laid out against.
    start: bed.start + lead,
    stop: bed.stop + lead,
    input: tracks.indexOf(bed.track) + bedOffset
  }));

  const parts: string[] = [];
  const beds: string[] = [];

  placed.forEach((bed, index) => {
    /*
     * A crossfade is not something to specify — it's something already drawn.
     * Where one bed runs past where the next begins, the length of that overlap
     * IS the handover, so the outgoing one fades across exactly the stretch the
     * incoming one is rising through. Nobody has to describe it, and the two
     * halves cannot disagree about it.
     *
     * Equal-power curves on both sides, so the level holds flat through the
     * handover instead of dipping in the middle the way two linear ramps do.
     */
    const fades = bedFades(placed, index, Math.max(0, adv.bedFadeSeconds));
    const fadeInSec = fades.in;
    const fadeOutSec = fades.out;
    const curveIn = fades.crossIn ? ':curve=qsin' : '';
    const curveOut = fades.crossOut ? ':curve=qsin' : '';

    // Match the natural track's format before doing anything else.
    let chain = 'aresample=48000,aformat=channel_layouts=stereo';
    if (bed.start > 0) {
      // Hold the bed until its in-point by padding the front with silence.
      const delayMs = Math.round(bed.start * 1000);
      chain += `,adelay=${delayMs}|${delayMs}`;
    }
    chain += `,volume=${volume}`;

    // A zero-length fade is not a fade, and ffmpeg would rather not be asked.
    if (fadeInSec > 0) {
      chain += `,afade=t=in:st=${bed.start.toFixed(3)}:d=${fadeInSec.toFixed(3)}${curveIn}`;
    }
    if (fadeOutSec > 0) {
      const from = Math.max(bed.start, bed.stop - fadeOutSec);
      chain += `,afade=t=out:st=${from.toFixed(3)}:d=${fadeOutSec.toFixed(3)}${curveOut}`;
    }

    // Every bed is looped on the way in, so each one has to be given an end.
    // `amix` alone can't supply one once the footage audio is gone.
    chain += `,atrim=0:${bed.stop.toFixed(3)},asetpts=N/SR/TB`;

    // Ducking against footage audio that isn't in the mix would be sidechaining
    // off silence, so it's skipped rather than quietly doing nothing.
    if (bed.track.duck && !config.musicOnly) {
      parts.push(`[${bed.input}:a]${chain}[raw${index}]`);
      parts.push(`[raw${index}]${footage()}${DUCK}[bed${index}]`);
    } else {
      parts.push(`[${bed.input}:a]${chain}[bed${index}]`);
    }
    beds.push(`[bed${index}]`);
  });

  // Every track was zero-length or past the end of the clip.
  if (beds.length === 0) return withFootage(tail(`${footage()}anull[amx]`));

  /*
   * `longest` rather than `first`, because a bed can stop early: with the
   * footage in the mix its own audio is first and runs the whole way, but
   * without it the first bed might be the one that ends soonest, and `first`
   * would take every other bed down with it. Everything is already bounded —
   * each bed by its own end, the mix by `bounded` above.
   */
  const sources = config.musicOnly ? beds : [footage(), ...beds];
  parts.push(`${sources.join('')}amix=inputs=${sources.length}:duration=longest:normalize=0[amx]`);

  return withFootage(tail(parts.join(';')));
}

/**
 * Picks a timestamp worth looking at, inside a window.
 *
 * A naive `-frames:v 1` grabs whatever is there, and plenty of editor exports
 * start on a literal black frame. Walk a few timestamps and take the first that
 * isn't near-black; if the whole window is dark, use the brightest candidate.
 *
 * Two callers want the same thing for different reasons. The cover still is
 * what a platform shows before anyone presses play, so a black one is a clip
 * nobody clicks. A look swatch has to show what a grade does, and a grade on a
 * black frame is a black frame — every look in the picker comes out identical
 * and the swatches are worse than the names they replaced.
 */
export async function pickBrightTime(
  videoPath: string,
  windowSeconds: number,
  adv: ClipAdvancedConfig
): Promise<number> {
  let bestTime = 0;
  let bestLuma = -1;

  for (let i = 0; i <= 5; i++) {
    const t = (windowSeconds * 0.85 * i) / 5;
    let luma: number | null = null;

    try {
      // metadata=print writes at INFO level, so the log level must allow it.
      const log = await runFfmpeg([
        '-loglevel',
        'info',
        '-ss',
        t.toFixed(2),
        '-i',
        videoPath,
        '-frames:v',
        '1',
        '-vf',
        'signalstats,metadata=print:key=lavfi.signalstats.YAVG',
        '-f',
        'null',
        '-'
      ]);
      const match = /YAVG=([0-9.]+)/.exec(log);
      if (match) luma = Number(match[1]);
    } catch {
      continue;
    }

    if (luma == null) continue;
    if (luma > bestLuma) {
      bestLuma = luma;
      bestTime = t;
    }
    if (luma >= adv.coverLumaThreshold) return t;
  }

  return bestTime;
}

/**
 * Renders a clip project to a finished, post-ready video.
 * Throws if ffmpeg is unavailable or any stage fails.
 */
export async function renderClip(
  input: RenderInput,
  options: RenderOptions = {}
): Promise<RenderResult> {
  const { onProgress, onLog, signal } = options;

  if (!(await hasBinary('ffmpeg'))) {
    throw new Error('ffmpeg is not installed on this server');
  }
  if (input.sources.length === 0) {
    throw new Error('A clip needs at least one source video');
  }

  const config: ClipRenderConfig = { ...DEFAULT_CLIP_CONFIG, ...input.config };
  // Keep speed inside atempo's range; 1 means untouched.
  config.speed = clamp(config.speed || 1, 0.5, 2);

  // Renderer internals: stored config overrides the defaults field by field, so
  // a project saved before a dial existed still renders with the default.
  const adv: ClipAdvancedConfig = { ...DEFAULT_ADVANCED_CONFIG, ...(config.advanced ?? {}) };

  let { width, height } = DIMENSIONS[config.aspect] ?? DIMENSIONS['9:16'];

  const accentColor = config.logoColor || '#8b5cf6';

  const tmp = await stagingDir();
  /*
   * Never backwards.
   *
   * The stages are bands worked out from what this render will actually do —
   * whether it joins, whether it has an outro — and two of those marks could
   * cross: joining without an outro reported 65% at the end of the join and
   * then 64% on the way into the final encode. A bar that retreats reads as
   * something having gone wrong, which is the one thing it is there to tell you
   * about.
   *
   * Held here rather than fixed in the arithmetic because the arithmetic is
   * several independent bands, and any of them can be adjusted later without
   * anyone remembering that two of them must not overlap.
   */
  let reported = 0;
  const progress = (percent: number) => {
    const next = Math.round(clamp(percent, 0, 100));
    if (next <= reported) return;
    reported = next;
    onProgress?.(next);
  };

  /**
   * Stage timings, written into the job log.
   *
   * A render is several ffmpeg passes — one per source, one per card, a
   * loudness measurement, a join, a final encode — so "it was slow" is not
   * actionable without knowing which pass took the time.
   */
  const started = Date.now();
  let lastMark = started;
  const mark = (stage: string) => {
    const now = Date.now();
    onLog?.(`⏱ ${stage}: ${((now - lastMark) / 1000).toFixed(1)}s`);
    lastMark = now;
  };

  try {
    progress(2);

    // ---- 1) graphic assets ----------------------------------------------
    // Each placement is rasterised at the size it will actually be drawn, so an
    // SVG stays crisp rather than being scaled after the fact.
    const rasterize = async (source: string, target: string, targetWidth: number) => {
      if (/\.svg$/i.test(source)) {
        await writeFile(join(tmp, target), await rasterizeSvg(source, targetWidth));
      } else {
        await sharp(source).resize({ width: targetWidth }).png().toFile(join(tmp, target));
      }
    };

    const logoWidth = Math.round((width * adv.logoWidthPercent) / 100);
    const watermarkWidth = Math.round((width * adv.watermarkWidthPercent) / 100);
    const cardWidth = Math.round((width * (adv.outroWidthPercent ?? adv.logoWidthPercent)) / 100);

    const hasIntroGraphic = Boolean(input.introPath);
    const hasWatermarkGraphic = Boolean(input.watermarkPath);
    const hasOutroGraphic = Boolean(input.outroPath);

    if (input.introPath) await rasterize(input.introPath, 'logo.png', logoWidth);
    if (input.watermarkPath) await rasterize(input.watermarkPath, 'wm.png', watermarkWidth);
    if (input.outroPath) await rasterize(input.outroPath, 'card.png', cardWidth);

    // Intro length scales with the first clip's output duration.
    let introSeconds = adv.introFallbackSeconds;
    if (config.intro && hasIntroGraphic) {
      /*
       * A length that was asked for beats one that was worked out.
       *
       * The share, the floor, the ceiling and the cap on the first shot are
       * all answers to "nobody said how long" — so the moment someone drags
       * the intro's edge on the strip, none of them apply. Including the cap:
       * an intro over the whole of a short first shot is a thing people do on
       * purpose, and the strip is where they said so.
       */
      if (adv.introFixedSeconds != null && adv.introFixedSeconds > 0) {
        introSeconds = adv.introFixedSeconds;
        onLog?.(`Intro: ${introSeconds.toFixed(2)}s (set)`);
      } else {
        const firstDuration = (await probeDuration(input.sources[0].path)) / config.speed;
        if (firstDuration > 0) {
          introSeconds = clamp(
            firstDuration * adv.introPercent,
            adv.introMinSeconds,
            adv.introMaxSeconds
          );
          introSeconds = Math.min(introSeconds, firstDuration * INTRO_MAX_SHARE);
        }
        onLog?.(`Intro: ${introSeconds.toFixed(2)}s (clip ${firstDuration.toFixed(1)}s)`);
      }
    }

    // The big logo's vertical act, kept clear of wherever the caption lands.
    // Low enough to stay clear of a caption at the default height, which is
    // where an unanchored one lands.
    const logoBand = 0.36;

    progress(5);

    // ---- 2) normalise each source --------------------------------------
    /**
     * The bar's acts, sized to the stages that will actually run.
     *
     * They used to be fixed waypoints — 55, 70, 78 — so a single-source clip
     * with no outro jumped 15% the instant its sources finished, because two
     * stages that do nothing still owned a slice of the bar. Whatever they'd
     * have taken goes to the final encode, which is the stage still working.
     */
    const willJoin = input.sources.length > 1;
    const willOutro = config.outro && hasOutroGraphic;
    /*
     * Bands sized by where the time actually goes, not by how many stages
     * there are.
     *
     * Timed on a two-source clip: the parts took 2.3s, the join 0.2s and the
     * final encode 3.6s. The bar gave those 50, 10 and 31 points — so the
     * cheapest third of the work owned half the bar, and the most expensive
     * part of it crawled. A single-source clip was worse still: one slice of
     * fifty points, which jumped from 5% to 55% the moment that part finished
     * and then sat there for the whole encode.
     *
     * These are approximations and will be wrong for any particular clip — a
     * long still encodes faster than short footage does. They are closer than
     * counting stages, which is all a bar can honestly claim.
     */
    const joinBand = willJoin ? 4 : 0;
    const outroBand = willOutro ? 6 : 0;
    const finalStart = 45 + joinBand + outroBand;

    const parts: string[] = [];

    /*
     * Each source's share of the band, weighted by how long it is.
     *
     * Split evenly, a six-second still and a one-second cutaway owned the same
     * slice — so the bar raced through the short one and then appeared to stall
     * for the long one, which is the same amount of work described badly. How
     * long a part takes is roughly how long it *is*, which is the one thing
     * known before it is rendered.
     *
     * Falls back to even shares when nothing declares a length, which is what
     * the old arithmetic did for everything.
     */
    const weights = input.sources.map((source) => {
      if (source.trimStart != null && source.trimEnd != null) {
        return Math.max(0.1, source.trimEnd - source.trimStart);
      }
      return 1;
    });
    const weightTotal = weights.reduce((sum, value) => sum + value, 0) || 1;

    let sliceStart = 5;
    for (let i = 0; i < input.sources.length; i++) {
      const sourceSlice = (40 * weights[i]) / weightTotal;
      const from = sliceStart;
      parts.push(
        await renderPart(input.sources[i], i, {
          tmp,
          config,
          adv,
          width,
          height,
          signal,
          onLog,
          onProgress: (fraction) => progress(from + fraction * sourceSlice)
        })
      );
      sliceStart = from + sourceSlice;
      progress(sliceStart);
      mark(`source ${i + 1}/${input.sources.length}`);
    }

    // ---- 3) work out how the body goes together --------------------------
    /*
     * Two ways to put the parts together, and the placements decide which.
     *
     * Back to back in one lane is a sequence, and the concat demuxer copies the
     * streams without touching them. Anything else — a gap, an overlap, a
     * second lane — has to be composited onto a canvas. The cheap path is kept
     * rather than retired because most clips are still sequences, and every
     * clip made before placements existed is one.
     *
     * Neither is encoded here any more. The composite is a filter graph handed
     * to the pass below; the join is a stream copy that costs nothing.
     */
    const lengths = await Promise.all(parts.map((part) => probeDuration(part).catch(() => 0)));
    const sequential = isSequential(input.sources, lengths);

    /*
     * How long the clip is: the furthest end of anything on the timeline.
     *
     * It used to be the furthest end of the *footage*, so a bed or a caption
     * running past the last shot was simply cut — the clip stopped when the
     * pictures did and the music went with it. Which end of a timeline you are
     * looking at shouldn't depend on what kind of thing is there.
     *
     * A bed with no end of its own is excluded, deliberately: "until the clip
     * does" can't also decide when that is.
     */
    const contentEnd = Math.max(
      ...(input.captions ?? []).map((c) => c.end),
      ...(input.audio ?? []).map((a) => a.end ?? 0),
      0
    );

    const bodyInputs: string[] = [];
    const bodyGraph: string[] = [];
    let bodyVideo: string;
    let bodyAudio: string;
    let bodyDuration: number;
    let nextInput: number;

    if (sequential) {
      const joined = await joinParts(tmp, parts, adv, signal);
      bodyInputs.push('-i', joined);
      bodyVideo = '[0:v]';
      bodyAudio = '[0:a]';
      // Probed rather than summed: a crossfaded join is shorter than its parts.
      const joinedLength = await probeDuration(joined);
      bodyDuration = Math.max(joinedLength, contentEnd);

      /*
       * Black after the last frame, when something outlives the footage.
       *
       * `-t` can only cut; it cannot invent frames, so a bed running past the
       * end of a joined body would have been silently trimmed back to it. The
       * composite path needs none of this — its canvas is already the full
       * length and the footage is laid onto it.
       */
      if (bodyDuration > joinedLength + 0.01) {
        bodyGraph.push(
          `[0:v]tpad=stop_mode=add:stop_duration=${(bodyDuration - joinedLength).toFixed(3)}:color=black[padded]`
        );
        bodyVideo = '[padded]';
      }
      nextInput = 1;
    } else {
      const composed = compositeGraph(
        parts,
        input.sources,
        lengths,
        width,
        height,
        adv,
        contentEnd
      );
      bodyInputs.push(...composed.inputs);
      bodyGraph.push(...composed.graph);
      bodyVideo = composed.video;
      bodyAudio = composed.audio;
      bodyDuration = composed.duration;
      // The canvas, the silence and every placement come before the beds.
      nextInput = 2 + parts.length;
      onLog?.(`Laid out ${parts.length} placement(s) on the timeline`);
    }

    progress(45 + joinBand);
    mark(sequential ? 'join' : 'lay out');

    // ---- 3a) the processed look, on the whole clip -----------------------
    /*
     * On the composed picture, not on each shot — because `t` means something
     * different in the two places, and only one of them is the clip's own.
     *
     * This ran per part to begin with, which was wrong twice over. Anything
     * driven by time restarted at every cut: `dropout` tears a tenth of a
     * second in, so a clip of four shots tore four times, once at each join,
     * which reads as an edit rather than as a fault. And anything at all was
     * applied per placement, so a gap in the timeline came out as clean black
     * while the footage either side of it was degraded, and two overlapping
     * shots each carried the look into the overlap, where it landed twice.
     *
     * Before the branding on purpose. A tape look is something the footage went
     * through; the logo and the watermark are put on afterwards, the way a
     * station ident sits over whatever is playing. Degrading them as well would
     * mostly mean an illegible mark.
     */
    const look = pictureGraph(
      config,
      // The body's length, not the finished clip's: effects run on
      // `bodyVideo`, which is everything before the outro is appended.
      { width, height, fps: adv.fps, duration: bodyDuration },
      bodyVideo,
      '[look]'
    );
    if (look.length) {
      // Statements, not one chain: an effect may branch to ruin a strip of the
      // picture and composite it back, which is more than a comma can express.
      bodyGraph.push(...look);
      bodyVideo = '[look]';
      onLog?.(
        `Look: ${clipEffects(config)
          .map((e) => e.id)
          .join(', ')}`
      );
    }

    /*
     * ---- 3a½) the intro's run-up ---------------------------------------
     *
     * Time at the head that the arrangement knows nothing about: the clip
     * opens on the mark and the footage starts once it has gone by. `tpad`
     * either clones the first frame into it or fills it with the card colour,
     * and the sound is delayed to match — everything that was timed from the
     * first frame of footage still is, because the footage moved and it moved
     * with it. The captions are the exception: they are burned in later, over
     * a picture that has already been shifted, so they are told separately.
     */
    const introLead =
      config.intro && hasIntroGraphic
        ? Math.max(0, Math.min(adv.introLeadSeconds ?? 0, introSeconds))
        : 0;
    if (introLead > 0) {
      bodyGraph.push(
        `${bodyVideo}tpad=start_duration=${introLead.toFixed(3)}:start_mode=${
          config.introHold ? 'clone' : `add:color=${adv.cardBackground.replace(/^#/, '0x')}`
        }[lead]`
      );
      bodyGraph.push(`${bodyAudio}adelay=${Math.round(introLead * 1000)}:all=1[leada]`);
      bodyVideo = '[lead]';
      bodyAudio = '[leada]';
      bodyDuration += introLead;
      onLog?.(
        `Intro run-up: ${introLead.toFixed(2)}s on ${config.introHold ? 'the first frame' : 'a card'}`
      );
    }

    // ---- 3b) branding, on the finished picture --------------------------
    /*
     * The logo and the watermark go on here, over the whole clip, at the times
     * the timeline says — not onto whichever piece of footage happened to be
     * first. Before the outro, so the closing card stays clean, which is what
     * the per-part version did by accident and this one does on purpose.
     */
    if (hasIntroGraphic && config.intro && introSeconds > 0) {
      /*
       * Out on a short fade; in on none.
       *
       * Frame one has to carry the mark at full strength — every platform
       * grabs it as the cover — so the one fade an intro gets is its exit.
       */
      const fade = Math.max(0.01, adv.markFadeSeconds);
      const fadeAt = Math.max(0.1, introSeconds - fade);
      bodyInputs.push('-loop', '1', '-i', join(tmp, 'logo.png'));
      bodyGraph.push(
        `[${nextInput}:v]format=rgba,fade=t=out:st=${fadeAt.toFixed(2)}:d=${fade.toFixed(
          2
        )}:alpha=1[big]`
      );
      bodyGraph.push(
        `${bodyVideo}[big]overlay=(W-w)/2:H*${logoBand}-h/2:${OVERLAY_STILL}` +
          `:enable='between(t,0,${introSeconds.toFixed(2)})'[withlogo]`
      );
      bodyVideo = '[withlogo]';
      nextInput += 1;
    }

    if (hasWatermarkGraphic && config.watermark) {
      const from = config.intro && hasIntroGraphic ? introSeconds : 0;
      /*
       * And off again when the closing mark arrives.
       *
       * One mark at a time: the watermark exists to brand the stretch of clip
       * that has no mark of its own, and the opening logo already pushes its
       * start past the intro. The card used to cover it at the other end by
       * accident — it is opaque — and the moment the card became a held frame
       * the two were on screen together.
       */
      const until = willOutro
        ? Math.max(from, bodyDuration - (config.outroHold ? 0 : adv.outroOverlapSeconds))
        : 0;
      const window =
        until > from
          ? `between(t,${from.toFixed(2)},${until.toFixed(2)})`
          : `gte(t,${from.toFixed(2)})`;
      /*
       * And out again rather than off.
       *
       * It used to simply stop being drawn the moment the closing mark was
       * due, which on a held frame is a logo vanishing between one frame and
       * the next while nothing else changes.
       */
      const fade = Math.max(0.01, adv.markFadeSeconds);
      const leaves =
        until > from
          ? `,fade=t=out:st=${(until - fade).toFixed(2)}:d=${fade.toFixed(2)}:alpha=1`
          : '';
      bodyInputs.push('-loop', '1', '-i', join(tmp, 'wm.png'));
      bodyGraph.push(
        `[${nextInput}:v]format=rgba,fade=t=in:st=${from.toFixed(2)}:d=${fade.toFixed(
          2
        )}:alpha=1${leaves}[wm]`
      );
      bodyGraph.push(
        // From the near edge, whichever side that is: ffmpeg works `W-w` out
        // per frame, so the mark sits the same distance in at any size.
        `${bodyVideo}[wm]overlay=${
          adv.watermarkAlign === 'right' ? `W-w-${adv.watermarkInset}` : adv.watermarkInset
        }:${adv.watermarkInset}:${OVERLAY_STILL}` + `:enable='${window}'[withwm]`
      );
      bodyVideo = '[withwm]';
      nextInput += 1;
    }

    // ---- 4) the outro dissolve, as part of the same graph ----------------
    let totalDuration = bodyDuration;
    if (config.outro && hasOutroGraphic && config.outroHold) {
      /*
       * The last frame, held, with the mark coming up over it.
       *
       * No second picture, so no dissolve: `tpad` clones the final frame for
       * as long as the card is meant to last and the graphic fades in over
       * what is already there. Which is why the clip grows by the whole of
       * `outroSeconds` here and by `outroSeconds` less the overlap below —
       * there, the card spends its first moments dissolving over footage that
       * is still playing; here, nothing is playing.
       *
       * The sound is padded with silence rather than held, because a frozen
       * frame is a picture and a held sound is a stuck record. It fades across
       * the same overlap, so the music lands on the mark rather than stopping
       * with the footage.
       */
      const over = Math.min(adv.outroOverlapSeconds, adv.outroSeconds);
      // What is left of the card once the part lying over the footage is
      // taken off it: that is the only piece that adds to the clip.
      const hold = Math.max(0, adv.outroSeconds - over);
      const from = Math.max(0, bodyDuration - over);

      bodyInputs.push('-loop', '1', '-i', join(tmp, 'card.png'));
      bodyGraph.push(`${bodyVideo}tpad=stop_mode=clone:stop_duration=${hold.toFixed(3)}[held]`);
      const fade = Math.max(0.01, Math.min(adv.markFadeSeconds, Math.max(over, 0.01)));
      bodyGraph.push(
        `[${nextInput}:v]format=rgba,fade=t=in:st=${from.toFixed(3)}:d=${fade.toFixed(
          3
        )}:alpha=1[endmark]`
      );
      bodyGraph.push(
        `[held][endmark]overlay=(W-w)/2:(H-h)/2:${OVERLAY_STILL}` +
          `:enable='gte(t,${from.toFixed(3)})'[ov]`
      );
      bodyGraph.push(
        `${bodyAudio}afade=t=out:st=${from.toFixed(3)}:d=${Math.max(over, 0.1).toFixed(
          3
        )},apad=pad_dur=${hold.toFixed(3)}[oa]`
      );
      bodyVideo = '[ov]';
      bodyAudio = '[oa]';
      nextInput += 1;

      totalDuration = bodyDuration + hold;
      mark('outro');
    } else if (config.outro && hasOutroGraphic) {
      const outroCard = await renderCard(
        tmp,
        'zz_outro.mp4',
        adv.outroSeconds,
        width,
        height,
        true,
        adv,
        signal
      );
      const overlap = adv.outroOverlapSeconds;
      const offset = Math.max(0, bodyDuration - overlap);

      bodyInputs.push('-i', outroCard);
      /*
       * Both sides onto one timebase before the dissolve.
       *
       * `xfade` refuses inputs whose timebases differ, and now that the body is
       * composed in this same graph rather than handed over as a file, they do:
       * the canvas carries the lavfi source's 1/30 and the card carries the
       * 1/15360 it was decoded with. Two files always happened to agree, which
       * is why this never came up before.
       */
      bodyGraph.push(`${bodyVideo}fps=${adv.fps},settb=AVTB[xbody]`);
      bodyGraph.push(`[${nextInput}:v]fps=${adv.fps},settb=AVTB[xcard]`);
      bodyGraph.push(
        `[xbody][xcard]xfade=transition=fade:duration=${overlap}:offset=${offset.toFixed(3)}[ov]`
      );
      bodyGraph.push(`${bodyAudio}[${nextInput}:a]acrossfade=d=${overlap}[oa]`);
      bodyVideo = '[ov]';
      bodyAudio = '[oa]';
      nextInput += 1;

      // The card adds its own length less the overlap it dissolves through.
      totalDuration = bodyDuration + Math.max(0, adv.outroSeconds - overlap);
      mark('outro');
    }
    progress(finalStart - 1);

    // ---- 5) burn text, fades, music bed, encode -------------------------
    const videoFilters: string[] = [];
    let audioChain = '';

    const captions = input.captions ?? [];
    if (captions.length) {
      /*
       * The face, and where to find it.
       *
       * A chosen face comes with its own file: `fontsdir` hands libass a
       * directory to look in before it asks the system anything, so the
       * caption is burned in the drawing the site is set in whatever the
       * container happens to have installed. Nothing chosen falls back to the
       * old search — `fc-match` against a list of families that might be
       * there, which is how this worked when the answer could only ever be a
       * system font.
       */
      /*
       * Anything this clip could draw with, not just its default.
       *
       * The directory is handed over whenever *any* line names a face, because
       * a caption overriding the clip's choice has to resolve too — and the
       * directory holds every face either could ask for.
       */
      const wanted = config.captionFont || '';
      const anyOwn = captions.some((caption) => Boolean(caption.font));
      const chosen = fontById(wanted);
      const picked = chosen || anyOwn ? await captionFont(wanted) : null;

      /*
       * Shifted by the run-up, because they are not.
       *
       * Everything else in the clip moved when `tpad` pushed the footage
       * along; the subtitles are drawn onto the finished picture afterwards
       * and would otherwise still be timed to where the footage used to
       * start — every caption early by the length of the run-up.
       */
      const timed = introLead
        ? captions.map((caption) => ({
            ...caption,
            start: caption.start + introLead,
            end: caption.end + introLead
          }))
        : captions;

      const ass = buildAss(
        {
          width,
          height,
          config,
          adv,
          font: chosen ? chosen.name : await resolveFont(adv, onLog),
          accentColor
        },
        timed
      );
      const assPath = join(tmp, 'subs.ass');
      await writeFile(assPath, ass);
      if (picked) onLog?.(`Captions: ${picked.dir}`);
      videoFilters.push(
        picked
          ? `ass=f=${escapeFilterPath(assPath)}:fontsdir=${escapeFilterPath(picked.dir)}`
          : `ass=${escapeFilterPath(assPath)}`
      );
    }

    // Fade OUT only, never in. A video fade-in makes frame 1 pure black, and
    // every platform grabs frame 1 as the in-feed preview — so the post would
    // show a black card. It would also cancel the intro design, which puts the
    // logo at full opacity on frame 1 precisely so the thumbnail is branded.
    // Audio is free to fade in: nobody sees it, and it avoids a click on a hot
    // first frame. That asymmetry is why picture and sound are separate options.
    /*
     * Before the fade out, so a clip shorter than both fades does the sensible
     * thing rather than fighting itself: `fade` filters compose, and the one
     * that starts first wins the frames it covers.
     */
    if (config.videoFadeIn) {
      videoFilters.push(`fade=t=in:st=0:d=${adv.videoFadeInSeconds}`);
    }
    if (config.videoFadeOut) {
      const start = Math.max(0, totalDuration - adv.videoFadeOutSeconds);
      videoFilters.push(`fade=t=out:st=${start.toFixed(2)}:d=${adv.videoFadeOutSeconds}`);
    }

    const audioFades: string[] = [];
    if (config.audioFadeIn) {
      audioFades.push(`afade=t=in:st=0:d=${adv.audioFadeInSeconds}`);
    }
    if (config.audioFadeOut) {
      const start = Math.max(0, totalDuration - adv.audioFadeOutSeconds);
      audioFades.push(`afade=t=out:st=${start.toFixed(2)}:d=${adv.audioFadeOutSeconds}`);
    }
    audioChain = audioFades.join(',');

    // Edge sanitiser, always, last: replicate the outermost valid pixels over
    // the outer ring. Kills a coloured "grain strip" at a frame border, whose
    // root cause is that a 1080-wide source isn't a multiple of 16, so H.264
    // pads its coded frame to 1088 — 8px of macroblock padding that some
    // zoom/grain/grade combos surface. The fill must be wider than those 8px.
    const ring = adv.edgeFillPixels;
    videoFilters.push(
      `fillborders=left=${ring}:right=${ring}:top=${ring}:bottom=${ring}:mode=smear`
    );

    const videoChain = videoFilters.join(',');

    /*
     * A missing track shouldn't fail the whole render — one bed of three going
     * astray costs that bed, not the clip. Checked one at a time for the same
     * reason.
     */
    const tracks: ClipAudioInput[] = [];
    for (const track of input.audio ?? []) {
      try {
        await probeDuration(track.path);
        tracks.push(track);
      } catch {
        onLog?.(`Audio not found or unreadable: ${track.path} — rendering without it`);
      }
    }

    /*
     * One pass, from the placements to the file that gets posted.
     *
     * Laying the parts out, dissolving into the outro and burning the captions
     * were three encodes of every frame, each one decoding what the last had
     * just written and throwing away a little more of the picture. On a
     * four-minute clip that was three quarters of an hour of encoding for four
     * minutes of video. The stages above build filter graph instead of files,
     * and this is where all of it finally runs.
     */
    const finalArgs: string[] = ['-y', '-loglevel', 'error', ...bodyInputs];

    if (tracks.length > 0) {
      onLog?.(
        `Audio: ${tracks.length} bed(s), replacing clip audio: ${config.musicOnly}` +
          tracks
            .map(
              (t) =>
                `\n  ${t.start}s–${t.end ?? 'end'} from ${t.seek}s` +
                ` fades ${t.fadeIn ? 'in' : '-'}/${t.fadeOut ? 'out' : '-'} duck ${t.duck}`
            )
            .join('')
      );

      for (const track of tracks) {
        finalArgs.push(
          // -stream_loop makes a bed cover any length; the mix caps it to the video.
          '-stream_loop',
          '-1',
          '-ss',
          String(track.seek),
          '-i',
          track.path
        );
      }
    }

    const graph = [
      ...bodyGraph,
      `${bodyVideo}${videoChain}[v]`,
      buildAudioGraph(
        tracks,
        config,
        adv,
        totalDuration,
        audioChain,
        bodyAudio,
        nextInput,
        introLead
      )
    ];

    finalArgs.push(
      '-filter_complex',
      graph.join(';'),
      '-map',
      '[v]',
      '-map',
      '[a]',
      /*
       * `-t` rather than `-shortest`. Every bed is looped on the way in, so
       * nothing in this graph ends on its own any more — the canvas would run
       * as long as the longest loop. The clip's length is known here, so it is
       * simply stated.
       */
      '-t',
      totalDuration.toFixed(3),
      // The encoder and the file it writes. Left off, ffmpeg builds the graph,
      // finds nothing for the mapped labels to go to, and reports it as an
      // unconnected filter — which reads like a fault in the graph and isn't.
      ...encodeArgs(adv, true),
      input.outputPath
    );

    mark('build filters');
    /*
     * The graph goes in the log, and into the error if this pass fails.
     *
     * A filter graph that ffmpeg refuses is unreadable from the outside: it
     * names one filter and one pad and says "invalid argument", and which of
     * fifty chained filters actually went wrong is only answerable by reading
     * the graph it was given. Without it every failure here is a guess.
     */
    onLog?.(`Filter graph:\n${graph.join(';\n')}`);
    try {
      await runFfmpeg(finalArgs, {
        signal,
        totalDuration,
        onProgress: (fraction) => progress(finalStart + fraction * (96 - finalStart))
      });
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      /*
       * The whole command, not just the graph.
       *
       * A graph that binds on its own can still be refused for what it was
       * handed — an input whose stream isn't there, a map that names a label
       * nothing produced, an option in the wrong place. None of that is visible
       * from the graph alone, and ffmpeg's complaint names a filter either way.
       */
      const shown = finalArgs
        .map((arg) => (/[\s;'"]/.test(arg) ? `'${arg.replace(/'/g, "'\\''")}'` : arg))
        .join(' ');
      throw new Error(`${reason}\n\nCommand:\nffmpeg ${shown}`);
    }

    progress(96);
    mark('final encode');

    // ---- 6) branded cover still ----------------------------------------
    let coverPath: string | undefined;
    if (hasIntroGraphic && config.intro) {
      try {
        const coverTime = await pickBrightTime(input.outputPath, introSeconds, adv);
        coverPath = input.outputPath.replace(/\.[^.]+$/, '.jpg');
        await runFfmpeg(
          [
            '-y',
            '-loglevel',
            'error',
            '-ss',
            coverTime.toFixed(2),
            '-i',
            input.outputPath,
            '-frames:v',
            '1',
            '-q:v',
            '3',
            coverPath
          ],
          { signal }
        );
        onLog?.(`Cover: t=${coverTime.toFixed(2)}s`);
      } catch {
        // A missing cover is cosmetic — never fail the render over it.
        coverPath = undefined;
      }
    }

    mark('cover');
    onLog?.(`⏱ total: ${((Date.now() - started) / 1000).toFixed(1)}s`);
    progress(100);

    return {
      outputPath: input.outputPath,
      coverPath,
      durationSeconds: await probeDuration(input.outputPath)
    };
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}
