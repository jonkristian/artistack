import { execFile } from 'child_process';
import { promisify } from 'util';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { runFfmpeg, probeVideo, probeDuration, rasterizeSvg, hasBinary } from './ffmpeg';
import {
  DEFAULT_CLIP_CONFIG,
  DEFAULT_ADVANCED_CONFIG,
  type ClipRenderConfig,
  type ClipAdvancedConfig,
  type TimedCaption,
  type ClipAspect
} from '$lib/clips/types';
import sharp from 'sharp';

const execFileAsync = promisify(execFile);

/**
 * Branded social-clip renderer.
 *
 * A port of The How's `thehow-clip` ffmpeg engine, generalised to take its
 * branding from the site's own settings instead of one band's hardcoded logo
 * set and palette. The pipeline and its filter graphs follow the original
 * closely — the ordering, timings and workarounds here were tuned against real
 * phone footage, and the comments record why each one exists. The pipeline runs
 * in the numbered stages marked inline below.
 */

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
  /** Music bed audio file. */
  musicPath?: string | null;
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
 * Encoder settings, derived from the advanced config.
 *
 * The bitrate cap stops grain and detail from bloating the file; bufsize is
 * kept at 1.6x maxrate, which is the ratio the original engine used. `final`
 * adds faststart, putting the moov atom up front for web playback — only worth
 * it on the file that actually gets served.
 */
function encodeArgs(adv: ClipAdvancedConfig, final = false): string[] {
  const args = [
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-preset',
    adv.preset,
    '-crf',
    String(adv.crf),
    '-maxrate',
    `${adv.maxrateMbps}M`,
    '-bufsize',
    `${(adv.maxrateMbps * 1.6).toFixed(1)}M`,
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
 * Measures a clip and returns a two-pass (linear) loudnorm filter string, or
 * null when the clip is effectively silent.
 *
 * Measuring first keeps the gain linear and preserves dynamics; single-pass
 * "dynamic" mode pumps and over-loudens. Clips below the floor are skipped
 * because normalising near-silence just amplifies hiss.
 */
async function loudnormFilter(path: string, adv: ClipAdvancedConfig): Promise<string | null> {
  const targets = `I=${adv.loudnormTarget}:TP=${adv.loudnormTruePeak}:LRA=${adv.loudnormRange}`;

  let output: string;
  try {
    // loudnorm's JSON report goes to stderr, and ffmpeg exits non-zero on some
    // inputs even after printing it, so read the log either way.
    output = await runFfmpeg([
      '-i',
      path,
      '-af',
      `loudnorm=${targets}:print_format=json`,
      '-f',
      'null',
      '-'
    ]);
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
function buildFill(fill: string, width: number, height: number, adv: ClipAdvancedConfig): string {
  const head = `[0:v]fps=${adv.fps},setpts=PTS-STARTPTS`;

  if (fill === 'black') {
    return (
      `${head},scale=${width}:${height}:force_original_aspect_ratio=decrease` +
      `:force_divisible_by=2,setsar=1,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black[filled]`
    );
  }

  if (fill === 'crop') {
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
 * Two styles share one look — Cap (lower-third, positioned by captionPosition)
 * and Head (big, centred). A caption uses Head when it is flagged as one.
 */
function buildAss(ctx: AssContext, captions: TimedCaption[]): string {
  const { width, height, config, adv, font, accentColor } = ctx;

  const capSize = Math.round(width / adv.captionSizeDivisor);
  const headSize = Math.round(width / adv.headlineSizeDivisor);

  let alignment: number;
  let marginV: number;
  switch (config.captionPosition) {
    case 'top':
      alignment = 8;
      marginV = Math.round((height * 8) / 100);
      break;
    case 'center':
      alignment = 5;
      marginV = 0;
      break;
    default:
      alignment = 2;
      marginV = Math.round((height * 24) / 100);
  }

  const primary = config.colorizeCaption ? assColor(accentColor) : '&H00FFFFFF';

  // BorderStyle 3 draws an opaque box behind the text; 1 is outline + shadow.
  const borderStyle = config.captionBackground ? 3 : 1;
  const backColor = config.captionBackground ? '&H80000000' : '&H00000000';
  const outline = config.captionBackground ? 8 : 4;
  const shadow = config.captionBackground ? 0 : 2;

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
    `Style: Cap,${font},${capSize},${primary},&H00000000,${backColor},1,` +
      `${borderStyle},${outline},${shadow},${alignment},` +
      `${adv.captionMarginX},${adv.captionMarginX},${marginV}`,
    `Style: Head,${font},${headSize},${primary},&H00000000,${backColor},1,` +
      `${borderStyle},${outline + 1},${shadow},5,24,24,0`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text'
  ];

  for (const caption of captions) {
    if (!caption.text?.trim()) continue;
    const style = caption.headline ? 'Head' : 'Cap';
    lines.push(
      `Dialogue: 0,${assTime(caption.start)},${assTime(caption.end)},${style},,0,0,0,,` +
        `{\\fad(250,250)}${assText(caption.text)}`
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
    introSeconds: number;
    logoBand: number;
    hasIntroGraphic: boolean;
    hasWatermarkGraphic: boolean;
    signal?: AbortSignal;
    onLog?: (line: string) => void;
  }
): Promise<string> {
  const { tmp, config, adv, width, height, hasIntroGraphic, hasWatermarkGraphic } = ctx;
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
  const fill = buildFill(config.fill, width, height, adv);
  const watermarkPos = `${adv.watermarkX}:${adv.watermarkY}`;

  // Per-clip watermark override, falling back to the project setting.
  const watermarkOn = hasWatermarkGraphic && (source.watermark ?? config.watermark);

  const isIntro = index === 0 && config.intro && hasIntroGraphic;

  // Input indices are computed rather than hardcoded: the watermark and intro
  // graphics are now independent, so either can be absent and the numbering
  // shifts. The order here must match the order the inputs are pushed below.
  let cursor = 1;
  const wmIndex = watermarkOn ? cursor++ : -1;
  const introIndex = isIntro ? cursor++ : -1;
  const silentIndex = cursor;

  let filterGraph: string;
  if (isIntro) {
    const introSec = ctx.introSeconds;
    const logoFadeOut = introSec > 0.6 ? introSec - 0.4 : 0.2;

    const introBig =
      `${fill};[filled]${chain}[base];` +
      `[${introIndex}:v]format=rgba,fade=t=out:st=${logoFadeOut.toFixed(2)}:d=0.4:alpha=1[big];` +
      `[base][big]overlay=(W-w)/2:H*${ctx.logoBand}-h/2:${OVERLAY_STILL}` +
      `:enable='between(t,0,${introSec.toFixed(2)})'[b1]`;

    filterGraph = watermarkOn
      ? `${introBig};[${wmIndex}:v]format=rgba,fade=t=in:st=${introSec.toFixed(2)}:d=0.3:alpha=1[wm];` +
        `[b1][wm]overlay=${watermarkPos}:${OVERLAY_STILL}` +
        `:enable='gte(t,${introSec.toFixed(2)})'[v]`
      : `${introBig};[b1]null[v]`;
  } else {
    filterGraph = watermarkOn
      ? `${fill};[filled]${chain}[base];[base][${wmIndex}:v]overlay=${watermarkPos}:${OVERLAY_STILL}[v]`
      : `${fill};[filled]${chain}[v]`;
  }

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
  const probe = await probeVideo(source.path);
  const silent = Boolean(source.muted) || !probe.hasAudio;
  if (source.muted) ctx.onLog?.(`Mute: clip ${index + 1} (music stays full here)`);

  const audioFilters: string[] = [];
  if (!silent) {
    if (speedOn) audioFilters.push(`atempo=${config.speed}`);
    if (config.loudnorm) {
      const ln = await loudnormFilter(source.path, adv);
      if (ln) audioFilters.push(ln);
    }
  }

  const args: string[] = ['-y', '-loglevel', 'error', ...seek, '-i', source.path];

  // Order must match the indices computed alongside the filter graph above.
  if (watermarkOn) args.push('-loop', '1', '-i', join(tmp, 'wm.png'));
  if (isIntro) args.push('-loop', '1', '-i', join(tmp, 'logo.png'));

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

  await runFfmpeg(args, { signal: ctx.signal });
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
async function joinParts(
  tmp: string,
  parts: string[],
  xfade: boolean,
  adv: ClipAdvancedConfig,
  signal?: AbortSignal
): Promise<string> {
  const output = join(tmp, 'joined.mp4');

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
        ...encodeArgs(adv, true),
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
      ...encodeArgs(adv, true),
      output
    ],
    { signal }
  );
  return output;
}

/** Builds the audio filter graph for a render that has a music bed. */
function buildMusicGraph(
  config: ClipRenderConfig,
  adv: ClipAdvancedConfig,
  totalDuration: number,
  audioChain: string
): string {
  const fadeOutStart = Math.max(0, totalDuration - config.musicFadeOut);

  // A bed under the footage sits back; a bed that replaced it is the whole
  // soundtrack and plays at full. loudnorm settles the absolute level after.
  const volume = config.musicOnly ? 1 : adv.musicBedVolume;

  // Match the natural track's format before doing anything else.
  let bed = 'aresample=48000,aformat=channel_layouts=stereo';
  if (config.musicStart > 0) {
    // Hold the bed until musicStart by padding the front with silence.
    const delayMs = Math.round(config.musicStart * 1000);
    bed += `,adelay=${delayMs}|${delayMs}`;
  }
  bed +=
    `,volume=${volume}` +
    `,afade=t=in:st=${config.musicStart}:d=${config.musicFadeIn}` +
    `,afade=t=out:st=${fadeOutStart.toFixed(2)}:d=${config.musicFadeOut}`;

  const tail = (mixed: string) =>
    audioChain ? `${mixed};[amx]${audioChain}[a]` : `${mixed};[amx]anull[a]`;

  if (config.musicCrossfade && config.musicCrossfade > 0) {
    // Crossfade takeover: the clip's own audio genuinely ENDS as the bed comes
    // up, rather than being summed at zero. Equal-power (qsin) curves hold the
    // level flat through the handoff instead of dipping.
    //
    // acrossfade blends A's last d seconds with B's first d, so the bed's t=0
    // lands at output musicStart — which is where the seeked-to in-point plays.
    // Lengths: nat = start + d, bed = total - start, so out = total.
    const natDuration = Math.min(config.musicStart + config.musicCrossfade, totalDuration);
    const bedDuration = Math.max(0.1, totalDuration - config.musicStart);
    const bedFadeOut = Math.max(0, fadeOutStart - config.musicStart);

    const bedChain =
      `aresample=48000,aformat=channel_layouts=stereo,atrim=0:${bedDuration.toFixed(3)},` +
      `asetpts=N/SR/TB,volume=${volume},` +
      `afade=t=out:st=${bedFadeOut.toFixed(3)}:d=${config.musicFadeOut}`;

    return tail(
      `[0:a]atrim=0:${natDuration.toFixed(3)},asetpts=N/SR/TB[nat];` +
        `[1:a]${bedChain}[bed];` +
        `[nat][bed]acrossfade=d=${config.musicCrossfade}:c1=qsin:c2=qsin[amx]`
    );
  }

  if (config.musicOnly) {
    // The bed replaces the natural audio outright.
    const chain = `[1:a]${bed},atrim=0:${totalDuration.toFixed(3)},asetpts=N/SR/TB`;
    return audioChain ? `${chain}[amx];[amx]${audioChain}[a]` : `${chain}[a]`;
  }

  if (config.duck) {
    // Sidechain the bed off the natural audio: music dips under speech and
    // swells back in the gaps.
    return tail(
      `[1:a]${bed}[bed];` +
        `[bed][0:a]sidechaincompress=threshold=0.03:ratio=8:attack=5:release=250[duckd];` +
        `[0:a][duckd]amix=inputs=2:duration=first:normalize=0[amx]`
    );
  }

  return tail(`[1:a]${bed}[bed];[0:a][bed]amix=inputs=2:duration=first:normalize=0[amx]`);
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

  const { width, height } = DIMENSIONS[config.aspect] ?? DIMENSIONS['9:16'];
  const accentColor = config.logoColor || '#8b5cf6';

  const tmp = await mkdtemp(join(tmpdir(), 'artistack-clip-'));
  const progress = (percent: number) => onProgress?.(Math.round(clamp(percent, 0, 100)));

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

    // The big logo's vertical band, kept clear of wherever the caption lands.
    const logoBand =
      config.captionPosition === 'top' ? 0.62 : config.captionPosition === 'center' ? 0.4 : 0.36;

    progress(5);

    // ---- 2) normalise each source --------------------------------------
    const parts: string[] = [];
    for (let i = 0; i < input.sources.length; i++) {
      parts.push(
        await renderPart(input.sources[i], i, {
          tmp,
          config,
          adv,
          width,
          height,
          introSeconds,
          logoBand,
          hasIntroGraphic,
          hasWatermarkGraphic,
          signal,
          onLog
        })
      );
      progress(5 + ((i + 1) / input.sources.length) * 50);
    }

    // ---- 3) join --------------------------------------------------------
    let joined = await joinParts(tmp, parts, config.xfade, adv, signal);
    progress(70);

    // ---- 4) outro dissolve into a graphic card ---------------------------
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
      const bodyDuration = await probeDuration(joined);
      const overlap = adv.outroOverlapSeconds;
      const offset = Math.max(0, bodyDuration - overlap);
      const withOutro = join(tmp, 'joined_outro.mp4');

      await runFfmpeg(
        [
          '-y',
          '-loglevel',
          'error',
          '-i',
          joined,
          '-i',
          outroCard,
          '-filter_complex',
          `[0:v][1:v]xfade=transition=fade:duration=${overlap}:offset=${offset.toFixed(3)}[v];` +
            `[0:a][1:a]acrossfade=d=${overlap}[a]`,
          '-map',
          '[v]',
          '-map',
          '[a]',
          ...encodeArgs(adv, true),
          withOutro
        ],
        { signal }
      );
      joined = withOutro;
    }
    progress(78);

    // ---- 5) burn text, fades, music bed, encode -------------------------
    const totalDuration = await probeDuration(joined);
    const videoFilters: string[] = [];
    let audioChain = '';

    const captions = input.captions ?? [];
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

    // A missing music file shouldn't fail the whole render.
    let musicPath = input.musicPath ?? null;
    if (musicPath) {
      try {
        await probeDuration(musicPath);
      } catch {
        onLog?.(`Music not found or unreadable: ${musicPath} — rendering without a bed`);
        musicPath = null;
      }
    }

    const finalArgs: string[] = ['-y', '-loglevel', 'error'];

    if (musicPath) {
      const seek = config.musicSeek;

      onLog?.(
        `Music: seek ${seek.toFixed(2)}s ` +
          `start ${config.musicStart}s duck ${config.duck} only ${config.musicOnly}`
      );

      finalArgs.push(
        '-i',
        joined,
        // -stream_loop makes the bed cover any length; the mix caps it to the video.
        '-stream_loop',
        '-1',
        '-ss',
        String(seek),
        '-i',
        musicPath,
        '-filter_complex',
        `[0:v]${videoChain}[v];${buildMusicGraph(config, adv, totalDuration, audioChain)}`,
        '-map',
        '[v]',
        '-map',
        '[a]',
        '-shortest'
      );
    } else {
      finalArgs.push('-i', joined, '-vf', videoChain);
      if (audioChain) finalArgs.push('-af', audioChain);
    }

    finalArgs.push(...encodeArgs(adv, true), input.outputPath);

    await runFfmpeg(finalArgs, {
      signal,
      totalDuration,
      onProgress: (fraction) => progress(78 + fraction * 18)
    });

    progress(96);

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
