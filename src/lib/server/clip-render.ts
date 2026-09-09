import { execFile } from 'child_process';
import { promisify } from 'util';
import { mkdtemp, mkdir, rm, readdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { runFfmpeg, probeVideo, probeDuration, rasterizeSvg, hasBinary } from './ffmpeg';
import { DATA_DIR } from './paths';
import {
  captionAnchors,
  captionBackdrop,
  captionColor,
  captionY,
  DEFAULT_CLIP_CONFIG,
  DEFAULT_ADVANCED_CONFIG,
  type ClipRenderConfig,
  type ClipAdvancedConfig,
  type ClipAudioTrack,
  type TimedCaption,
  type ClipAspect
} from '$lib/clips/types';
import sharp from 'sharp';

const execFileAsync = promisify(execFile);

/**
 * Branded social-clip renderer.
 *
 * A port of The How's `thehow-clip` ffmpeg engine, generalised to take its
 * branding from the site's own settings instead of one act's hardcoded logo
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
export async function clearAbandonedStaging(): Promise<number> {
  const entries = await readdir(STAGING_ROOT, { withFileTypes: true }).catch(() => []);
  let cleared = 0;

  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith('clip-')) continue;
    await rm(join(STAGING_ROOT, entry.name), { recursive: true, force: true }).catch(() => {});
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
  /**
   * Render a proof: the same edit, made quickly and thrown away.
   *
   * For judging where things sit while you work, which needs the timing to be
   * right and nothing else. See PROOF below for what it gives up.
   */
  proof?: boolean;
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
 * [THE HOW] never wraps mid-way. Brackets are stripped; text outside them wraps
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
  source?: { width: number; height: number }
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
  let fills = false;
  if (source && source.width > 0 && source.height > 0) {
    const quarter = Math.abs((((rotation ?? 0) % 360) + 360) % 360) % 180 === 90;
    const w = quarter ? source.height : source.width;
    const h = quarter ? source.width : source.height;
    fills = Math.abs(w / h - width / height) / (width / height) < 0.01;
  }

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
    return (
      `${head},scale=${width}:${height}:force_original_aspect_ratio=increase` +
      `:force_divisible_by=2,crop=${width}:${height},setsar=1[filled]`
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
function buildAss(ctx: AssContext, captions: TimedCaption[]): string {
  const { width, height, config, adv, font, accentColor } = ctx;

  const capSize = Math.round(width / adv.captionSizeDivisor);
  const headSize = Math.round(width / adv.headlineSizeDivisor);

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
   * still make one style, and nobody writes styles that go unused.
   *
   * BorderStyle 3 draws the panel; 1 is outline and shadow. The heavier outline
   * is what gives the panel its padding, and the big voice takes one more pixel
   * of it than the normal one.
   */
  const backdrops: (string | null)[] = [];
  for (const caption of captions) {
    const backdrop = captionBackdrop(caption, config);
    if (!backdrops.includes(backdrop)) backdrops.push(backdrop);
  }
  if (backdrops.length === 0) backdrops.push(null);

  /*
   * `BackColour` is `&HAABBGGRR`, where the alpha runs the other way from the
   * one anybody expects: 00 is solid and FF is invisible. So the dial, which
   * asks how solid the panel is, is inverted on the way in.
   */
  const veil = Math.round((1 - Math.min(100, Math.max(0, adv.captionBackdropPercent)) / 100) * 255)
    .toString(16)
    .padStart(2, '0')
    .toUpperCase();

  const styleLine = (name: string, size: number, backdrop: string | null, extraOutline = 0) =>
    `Style: ${name},${font},${size},${primary},&H00000000,` +
    `${backdrop ? `&H${veil}${assColor(backdrop).slice(4)}` : '&H00000000'},1,` +
    `${backdrop ? 3 : 1},${(backdrop ? 8 : 4) + extraOutline},${backdrop ? 0 : 2},` +
    `${alignment},${adv.captionMarginX},${adv.captionMarginX},${marginV}`;

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
    ...backdrops.map((backdrop, i) => styleLine(`Cap${i}`, capSize, backdrop)),
    /*
     * A headline is a caption in a bigger voice, not one in a different place.
     *
     * This style used to anchor centre with no margin, so a big caption landed
     * in the middle of the frame while the editor — and every normal caption —
     * put it where the clip's caption position said. Pressing its anchor button
     * fixed it, because that writes a `y` and the line's own `\an2` overrides
     * the style: so it was wrong exactly once, before anyone had touched it.
     *
     * Same alignment, same margins as Cap. The size and the heavier outline are
     * what make it a headline.
     */
    ...backdrops.map((backdrop, i) => styleLine(`Head${i}`, headSize, backdrop, 1)),
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text'
  ];

  for (const caption of captions) {
    if (!caption.text?.trim()) continue;
    const style = `${caption.headline ? 'Head' : 'Cap'}${backdrops.indexOf(
      captionBackdrop(caption, config)
    )}`;

    /*
     * A caption with a height of its own overrides the clip's.
     *
     * The Dialogue format has carried per-line margins all along — they were
     * `0,0,0`, which means "use the style's". Setting MarginV places this line
     * and no other, so several captions can sit at several heights in the same
     * second, which is the whole point of asking.
     *
     * `\an2` comes with it because MarginV is measured from whichever edge the
     * alignment anchors to. Without it, the same number would mean "up from the
     * bottom" on one clip and "down from the top" on another.
     */
    const marginV = Math.round(Math.min(1, Math.max(0, captionY(caption, adv))) * height);
    const anchor = '{\\an2}';

    /*
     * Stated per line rather than left to the style.
     *
     * `\1c` takes `&HBBGGRR&` where the style's `PrimaryColour` takes an alpha
     * pair as well, so the two spellings of one colour are not interchangeable
     * — hence the slice rather than a second formatter.
     */
    const colour = `{\\1c&H${assColor(captionColor(caption, config, accentColor)).slice(4)}&}`;

    lines.push(
      `Dialogue: 0,${assTime(caption.start)},${assTime(caption.end)},${style},,0,0,${marginV},,` +
        `${anchor}${colour}{\\fad(250,250)}${assText(caption.text)}`
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

  const chain = effects.length ? effects.join(',') : 'null';
  // Read here rather than further down, because the fill wants to know whether
  // the footage already covers the frame before it decides to build one.
  const probe = await probeVideo(source.path);
  const fill = buildFill(config.fill, width, height, adv, source.rotation, probe);
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

  const filterGraph = `${fill};[filled]${chain}[v]`;

  // Trim on the input side (fast seek); it's re-encoded downstream so it stays accurate.
  const seek: string[] = [];
  if (source.trimStart != null && source.trimEnd != null) {
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

  const args: string[] = ['-y', '-loglevel', 'error', ...seek, '-i', source.path];

  let audioMap: string;
  if (silent) {
    args.push('-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000');
    audioMap = `${silentIndex}:a`;
  } else {
    audioMap = '0:a';
  }

  args.push('-filter_complex', filterGraph);
  if (audioFilters.length) args.push('-af', audioFilters.join(','));
  args.push('-map', '[v]', '-map', audioMap);
  // -shortest stops the looped logo stills (and silence) from extending the clip.
  args.push('-shortest', ...encodeArgs(adv), partPath);

  // Trimmed length if set, otherwise the source's own — ffmpeg reports elapsed
  // output time, which only becomes a fraction against the expected total.
  const partDuration =
    source.trimStart != null && source.trimEnd != null
      ? Math.max(0, source.trimEnd - source.trimStart)
      : probe.duration;

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
    ? `[2:v]format=rgba,fade=t=in:st=0.3:d=0.7:alpha=1[lg];` +
      `[0:v][lg]overlay=(W-w)/2:(H-h)/2:${OVERLAY_STILL}[v]`
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
      length: lengths[index]
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

    graph.push(`[${input}:v]setpts=PTS+${at}/TB[pv${index}]`);
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

async function joinParts(
  tmp: string,
  parts: string[],
  xfade: boolean,
  adv: ClipAdvancedConfig,
  signal?: AbortSignal
): Promise<string> {
  const output = join(tmp, 'joined.mp4');

  // One part is already the joined clip. This used to fall through to the
  // concat demuxer below, which re-encoded the whole thing to produce a copy of
  // its only input — on a single-source clip that was the second most expensive
  // stage of the render, for nothing.
  if (parts.length === 1) return parts[0];

  if (xfade && parts.length >= 2) {
    const duration = adv.xfadeSeconds;
    const inputs: string[] = [];
    for (const part of parts) inputs.push('-i', part);

    // xfade offsets are absolute on the output timeline, so each one is the
    // running total minus the overlap consumed so far.
    let accumulated = await probeDuration(parts[0]);
    let prevVideo = '0:v';
    let prevAudio = '0:a';
    const graph: string[] = [];

    for (let k = 1; k < parts.length; k++) {
      const partDuration = await probeDuration(parts[k]);
      const offset = Math.max(0, accumulated - duration);
      graph.push(
        `[${prevVideo}][${k}:v]xfade=transition=fade:duration=${duration}` +
          `:offset=${offset.toFixed(3)}[vx${k}]`
      );
      graph.push(`[${prevAudio}][${k}:a]acrossfade=d=${duration}[ax${k}]`);
      prevVideo = `vx${k}`;
      prevAudio = `ax${k}`;
      accumulated = accumulated + partDuration - duration;
    }

    await runFfmpeg(
      [
        '-y',
        '-loglevel',
        'error',
        ...inputs,
        '-filter_complex',
        graph.join(';'),
        '-map',
        `[${prevVideo}]`,
        '-map',
        `[${prevAudio}]`,
        ...encodeArgs(adv),
        output
      ],
      { signal }
    );
    return output;
  }

  // concat demuxer: single-quotes in a path would break the list format, and
  // these are our own temp files, so plain interpolation is safe here.
  const listPath = join(tmp, 'list.txt');
  await writeFile(listPath, parts.map((p) => `file '${p}'`).join('\n') + '\n');

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
  bedOffset = 1
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
  const placed = tracks
    .map((track, index) => ({
      track,
      input: index + bedOffset,
      start: track.start,
      // Null means "until the clip does", and a value past the end means the
      // same thing — the clip is the outer bound either way.
      stop: Math.min(track.end ?? totalDuration, totalDuration)
    }))
    .filter((bed) => bed.stop > bed.start)
    .sort((a, b) => a.start - b.start);

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
    const next = placed[index + 1];
    const previous = placed[index - 1];
    const overlapOut = next ? Math.max(0, bed.stop - next.start) : 0;
    const overlapIn = previous ? Math.max(0, previous.stop - bed.start) : 0;

    const base = Math.max(0, adv.bedFadeSeconds);
    /*
     * The toggles govern a bed's own edges — how it arrives out of silence and
     * how it leaves. An overlap overrides them: two beds at full is not a
     * choice anyone makes, it's a clash.
     */
    const fadeInSec = overlapIn > 0 ? overlapIn : bed.track.fadeIn ? base : 0;
    const fadeOutSec = overlapOut > 0 ? overlapOut : bed.track.fadeOut ? base : 0;
    const curveIn = overlapIn > 0 ? ':curve=qsin' : '';
    const curveOut = overlapOut > 0 ? ':curve=qsin' : '';

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
 * Picks a timestamp for the cover still.
 *
 * The big intro logo is at full opacity from t=0, but the footage under it may
 * fade in from black — plenty of editor exports start on a literal black frame —
 * so a naive `-frames:v 1` grabs a black cover, exactly what this is meant to
 * prevent. Walk a few timestamps inside the intro window (logo still on screen)
 * and take the first that isn't near-black; if the whole window is dark, use
 * the brightest candidate.
 */
async function pickCoverTime(
  videoPath: string,
  introSeconds: number,
  adv: ClipAdvancedConfig
): Promise<number> {
  let bestTime = 0;
  let bestLuma = -1;

  for (let i = 0; i <= 5; i++) {
    const t = (introSeconds * 0.85 * i) / 5;
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

  if (input.proof) {
    /*
     * What a proof gives up, and what it keeps.
     *
     * Everything here is chosen against measurements on fifteen seconds of
     * 1080×1920: the full settings took 47.9s, this takes about 2.4s.
     *
     * Half size is the cheapest large saving and costs nothing that matters —
     * a proof is for judging timing, not sharpness. The blurred fill is the
     * single most expensive creative option, more than tripling even a small
     * render, so it goes; black bars change what the edges look like and
     * nothing about when anything happens. Loudnorm decodes every source in
     * full before the encode even starts, which is a quarter of the work for a
     * level nobody is judging yet.
     *
     * Grain, vignette, the grade and the branding all stay. They cost almost
     * nothing by comparison, and dropping them would make the proof a worse
     * answer to the question it exists for — which is what this will look like.
     */
    width = Math.round(width / 2 / 2) * 2;
    height = Math.round(height / 2 / 2) * 2;
    config.fill = 'black';
    config.loudnorm = false;

    /*
     * Nothing burned on. A proof is the picture, and the editor draws the
     * captions, the logo and the watermark over it in the browser — where a
     * caption can be retyped and land instantly instead of costing a render.
     *
     * Which also makes the proof cheaper: no libass pass, and no still image
     * composited over every frame of every source.
     */
    config.intro = false;
    config.watermark = false;
    adv.preset = 'ultrafast';
    adv.crf = 30;
    adv.audioBitrateKbps = 96;
    onLog?.(`Proof: ${width}×${height}, black fill, no loudnorm`);
  }
  const accentColor = config.logoColor || '#8b5cf6';

  const tmp = await stagingDir();
  const progress = (percent: number) => onProgress?.(Math.round(clamp(percent, 0, 100)));

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

    const hasIntroGraphic = Boolean(input.introPath);
    const hasWatermarkGraphic = Boolean(input.watermarkPath);
    const hasOutroGraphic = Boolean(input.outroPath);

    if (input.introPath) await rasterize(input.introPath, 'logo.png', logoWidth);
    if (input.watermarkPath) await rasterize(input.watermarkPath, 'wm.png', watermarkWidth);
    if (input.outroPath) await rasterize(input.outroPath, 'card.png', logoWidth);

    // Intro length scales with the first clip's output duration.
    let introSeconds = adv.introFallbackSeconds;
    if (config.intro && hasIntroGraphic) {
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
    const joinBand = willJoin ? 10 : 0;
    const outroBand = willOutro ? 8 : 0;
    const finalStart = 55 + joinBand + outroBand;

    const parts: string[] = [];
    const sourceSlice = 50 / input.sources.length;
    for (let i = 0; i < input.sources.length; i++) {
      const sliceStart = 5 + i * sourceSlice;
      parts.push(
        await renderPart(input.sources[i], i, {
          tmp,
          config,
          adv,
          width,
          height,
          signal,
          onLog,
          onProgress: (fraction) => progress(sliceStart + fraction * sourceSlice)
        })
      );
      progress(sliceStart + sourceSlice);
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
      const joined = await joinParts(tmp, parts, config.xfade, adv, signal);
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

    progress(55 + joinBand);
    mark(sequential ? 'join' : 'lay out');

    // ---- 3b) branding, on the finished picture --------------------------
    /*
     * The logo and the watermark go on here, over the whole clip, at the times
     * the timeline says — not onto whichever piece of footage happened to be
     * first. Before the outro, so the closing card stays clean, which is what
     * the per-part version did by accident and this one does on purpose.
     */
    const brandOn = !input.proof;
    if (brandOn && hasIntroGraphic && config.intro && introSeconds > 0) {
      const fadeAt = introSeconds > 0.6 ? introSeconds - 0.4 : 0.2;
      bodyInputs.push('-loop', '1', '-i', join(tmp, 'logo.png'));
      bodyGraph.push(
        `[${nextInput}:v]format=rgba,fade=t=out:st=${fadeAt.toFixed(2)}:d=0.4:alpha=1[big]`
      );
      bodyGraph.push(
        `${bodyVideo}[big]overlay=(W-w)/2:H*${logoBand}-h/2:${OVERLAY_STILL}` +
          `:enable='between(t,0,${introSeconds.toFixed(2)})'[withlogo]`
      );
      bodyVideo = '[withlogo]';
      nextInput += 1;
    }

    if (brandOn && hasWatermarkGraphic && config.watermark) {
      const from = config.intro && hasIntroGraphic ? introSeconds : 0;
      bodyInputs.push('-loop', '1', '-i', join(tmp, 'wm.png'));
      bodyGraph.push(
        `[${nextInput}:v]format=rgba,fade=t=in:st=${from.toFixed(2)}:d=0.3:alpha=1[wm]`
      );
      bodyGraph.push(
        `${bodyVideo}[wm]overlay=${adv.watermarkX}:${adv.watermarkY}:${OVERLAY_STILL}` +
          `:enable='gte(t,${from.toFixed(2)})'[withwm]`
      );
      bodyVideo = '[withwm]';
      nextInput += 1;
    }

    // ---- 4) the outro dissolve, as part of the same graph ----------------
    let totalDuration = bodyDuration;
    if (config.outro && hasOutroGraphic) {
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

    // Drawn over the video in the editor instead; see the proof block above.
    const captions = input.proof ? [] : (input.captions ?? []);
    if (captions.length) {
      const ass = buildAss(
        {
          width,
          height,
          config,
          adv,
          font: await resolveFont(adv, onLog),
          accentColor
        },
        captions
      );
      const assPath = join(tmp, 'subs.ass');
      await writeFile(assPath, ass);
      videoFilters.push(`ass=${escapeFilterPath(assPath)}`);
    }

    // Fade OUT only, never in. A video fade-in makes frame 1 pure black, and
    // every platform grabs frame 1 as the in-feed preview — so the post would
    // show a black card. It would also cancel the intro design, which puts the
    // logo at full opacity on frame 1 precisely so the thumbnail is branded.
    // Audio is free to fade in: nobody sees it, and it avoids a click on a hot
    // first frame. That asymmetry is why picture and sound are separate options.
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
      buildAudioGraph(tracks, config, adv, totalDuration, audioChain, bodyAudio, nextInput)
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
        const coverTime = await pickCoverTime(input.outputPath, introSeconds, adv);
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
