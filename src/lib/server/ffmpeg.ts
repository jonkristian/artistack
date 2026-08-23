import { execFile, spawn } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

/**
 * Video support leans on external binaries rather than a bundled library:
 * ffmpeg/ffprobe for anything video, rsvg-convert for rasterising SVG logos
 * into render overlays. They are optional — a self-hosted instance without
 * them keeps working, it just can't accept video or run the clip studio.
 */
export type VideoBinary = 'ffmpeg' | 'ffprobe' | 'rsvg-convert';

const availability = new Map<VideoBinary, Promise<boolean>>();

/**
 * The flag each binary accepts for a version probe. ffmpeg's tooling takes the
 * single-dash form; rsvg-convert's argument parser rejects it (reading `-v` as
 * a short flag) and needs the GNU long form.
 */
const VERSION_FLAG: Record<VideoBinary, string> = {
  ffmpeg: '-version',
  ffprobe: '-version',
  'rsvg-convert': '--version'
};

/**
 * Checks whether a binary is on PATH. Cached for the process lifetime — these
 * don't come and go while the server is running, and the media library asks on
 * every upload.
 */
export function hasBinary(bin: VideoBinary): Promise<boolean> {
  let cached = availability.get(bin);
  if (!cached) {
    // Running it beats `which`, so a PATH entry that isn't actually executable
    // (or is a broken symlink) reads as missing rather than present.
    cached = execFileAsync(bin, [VERSION_FLAG[bin]])
      .then(() => true)
      .catch(() => false);
    availability.set(bin, cached);
  }
  return cached;
}

/** True when video uploads can be processed at all. */
export async function videoSupported(): Promise<boolean> {
  const [ffmpeg, ffprobe] = await Promise.all([hasBinary('ffmpeg'), hasBinary('ffprobe')]);
  return ffmpeg && ffprobe;
}

/**
 * Video containers, identified by magic bytes.
 *
 * ISO-BMFF (mp4/mov/m4v) puts the 'ftyp' box type at offset 4, with the
 * preceding four bytes being the box *size* — so unlike the image formats there
 * is no fixed prefix to compare against, and we key off offset 4.
 */
const VIDEO_MAGIC: { mime: string; ext: string; bytes: number[]; offset: number }[] = [
  { mime: 'video/mp4', ext: 'mp4', bytes: [0x66, 0x74, 0x79, 0x70], offset: 4 }, // 'ftyp'
  { mime: 'video/webm', ext: 'webm', bytes: [0x1a, 0x45, 0xdf, 0xa3], offset: 0 } // EBML
];

/** ISO-BMFF major brands that mean QuickTime (.mov) rather than MP4. */
const QUICKTIME_BRANDS = new Set(['qt  ']);

/**
 * ISO-BMFF major brands that mean audio-only, so an .m4a isn't taken for video.
 * Brands are 4 bytes, space-padded.
 */
const M4A_BRANDS = new Set(['M4A ', 'M4B ']);

/** Audio containers, for music beds. */
const AUDIO_MAGIC: { mime: string; ext: string; bytes: number[]; offset: number }[] = [
  { mime: 'audio/flac', ext: 'flac', bytes: [0x66, 0x4c, 0x61, 0x43], offset: 0 }, // 'fLaC'
  { mime: 'audio/ogg', ext: 'ogg', bytes: [0x4f, 0x67, 0x67, 0x53], offset: 0 }, // 'OggS'
  { mime: 'audio/mpeg', ext: 'mp3', bytes: [0x49, 0x44, 0x33], offset: 0 } // 'ID3'
];

/** Number of leading bytes the detectors need. */
export const MEDIA_HEADER_BYTES = 12;

/** Back-compat alias; the detectors share one header length. */

export interface DetectedType {
  mime: string;
  ext: string;
  kind: 'video' | 'audio';
}

/**
 * Identifies a video container from its first bytes, or null if unrecognised.
 * Content-based, so a renamed or mislabelled upload can't slip through.
 */
export function detectVideoType(head: Buffer): { mime: string; ext: string } | null {
  for (const sig of VIDEO_MAGIC) {
    const actual = head.subarray(sig.offset, sig.offset + sig.bytes.length);
    if (!actual.equals(Buffer.from(sig.bytes))) continue;

    if (sig.mime === 'video/mp4') {
      const brand = head.subarray(8, 12).toString('latin1');
      // The major brand sits right after 'ftyp'; .mov carries 'qt  ', and an
      // audio-only .m4a shares the same container, so it must not match here.
      if (QUICKTIME_BRANDS.has(brand)) {
        return { mime: 'video/quicktime', ext: 'mov' };
      }
      if (M4A_BRANDS.has(brand)) return null;
    }
    return { mime: sig.mime, ext: sig.ext };
  }
  return null;
}

/** Identifies an audio container from its first bytes, or null. */
export function detectAudioType(head: Buffer): { mime: string; ext: string } | null {
  // RIFF/WAVE needs two separated checks, like WebP in the image path.
  if (
    head.subarray(0, 4).equals(Buffer.from([0x52, 0x49, 0x46, 0x46])) &&
    head.subarray(8, 12).equals(Buffer.from([0x57, 0x41, 0x56, 0x45]))
  ) {
    return { mime: 'audio/wav', ext: 'wav' };
  }

  // Bare MP3 with no ID3 tag: an MPEG audio frame sync (11 set bits).
  if (head[0] === 0xff && (head[1] & 0xe0) === 0xe0) {
    return { mime: 'audio/mpeg', ext: 'mp3' };
  }

  // Audio-only MP4 (.m4a).
  if (
    head.subarray(4, 8).equals(Buffer.from([0x66, 0x74, 0x79, 0x70])) &&
    M4A_BRANDS.has(head.subarray(8, 12).toString('latin1'))
  ) {
    return { mime: 'audio/mp4', ext: 'm4a' };
  }

  for (const sig of AUDIO_MAGIC) {
    const actual = head.subarray(sig.offset, sig.offset + sig.bytes.length);
    if (actual.equals(Buffer.from(sig.bytes))) {
      return { mime: sig.mime, ext: sig.ext };
    }
  }
  return null;
}

/** Identifies either a video or an audio container. Video is checked first. */
export function detectMediaType(head: Buffer): DetectedType | null {
  const video = detectVideoType(head);
  if (video) return { ...video, kind: 'video' };

  const audio = detectAudioType(head);
  if (audio) return { ...audio, kind: 'audio' };

  return null;
}

/**
 * Duration in seconds of any media file ffprobe understands.
 * Used for audio, which has no dimensions to report.
 */
export async function probeDuration(path: string): Promise<number> {
  const { stdout } = await execFileAsync('ffprobe', [
    '-v',
    'error',
    '-show_entries',
    'format=duration',
    '-of',
    'default=noprint_wrappers=1:nokey=1',
    path
  ]);
  return Number(stdout.trim()) || 0;
}

export interface VideoMetadata {
  width: number;
  height: number;
  /** Seconds, fractional. 0 when the container doesn't declare one. */
  duration: number;
  hasAudio: boolean;
  /** Frames per second, rounded to 3 decimals. 0 when unknown. */
  fps: number;
}

interface FfprobeStream {
  codec_type?: string;
  width?: number;
  height?: number;
  r_frame_rate?: string;
  /** Rotation lives here on modern ffprobe (side data is folded into the stream). */
  side_data_list?: { rotation?: number }[];
  tags?: { rotate?: string };
}

interface FfprobeOutput {
  streams?: FfprobeStream[];
  format?: { duration?: string };
}

/**
 * Reads dimensions, duration and audio presence from a video file.
 *
 * Dimensions are returned as *displayed*, not as stored: phone footage is very
 * often recorded landscape with a 90° rotation flag, and a naive read reports
 * 1920x1080 for a clip that is visually 1080x1920. Getting this wrong would
 * mislabel every vertical phone clip in the library.
 */
export async function probeVideo(path: string): Promise<VideoMetadata> {
  const { stdout } = await execFileAsync('ffprobe', [
    '-v',
    'error',
    '-show_entries',
    'stream=codec_type,width,height,r_frame_rate:stream_side_data=rotation:stream_tags=rotate:format=duration',
    '-of',
    'json',
    path
  ]);

  const probe: FfprobeOutput = JSON.parse(stdout);
  const streams = probe.streams ?? [];
  const video = streams.find((s) => s.codec_type === 'video');

  if (!video) {
    throw new Error('No video stream found');
  }

  let width = video.width ?? 0;
  let height = video.height ?? 0;

  const rotation =
    video.side_data_list?.find((d) => typeof d.rotation === 'number')?.rotation ??
    Number(video.tags?.rotate ?? 0);
  if (Math.abs(rotation) === 90 || Math.abs(rotation) === 270) {
    [width, height] = [height, width];
  }

  // r_frame_rate is a rational string like "30000/1001".
  let fps = 0;
  if (video.r_frame_rate) {
    const [num, den] = video.r_frame_rate.split('/').map(Number);
    if (num && den) fps = Math.round((num / den) * 1000) / 1000;
  }

  return {
    width,
    height,
    duration: Number(probe.format?.duration ?? 0) || 0,
    hasAudio: streams.some((s) => s.codec_type === 'audio'),
    fps
  };
}

/**
 * Grabs a single frame as a PNG buffer, for use as a poster/thumbnail.
 *
 * Seeks to 1s (or the midpoint of anything shorter) rather than frame 0: the
 * first frame of a phone clip is frequently a black or motion-blurred frame
 * from before the sensor settles, which makes for a useless library thumbnail.
 */
export async function extractPosterFrame(path: string, duration = 0): Promise<Buffer> {
  const seek = duration > 0 && duration < 2 ? duration / 2 : 1;

  return new Promise((resolve, reject) => {
    // -ss before -i is the fast (keyframe) seek, which is what we want here.
    const proc = spawn('ffmpeg', [
      '-v',
      'error',
      '-ss',
      seek.toFixed(3),
      '-i',
      path,
      '-frames:v',
      '1',
      // No rotation filter needed: the ffmpeg CLI auto-applies the container's
      // rotation flag, so the frame comes out matching probeVideo's dimensions.
      '-f',
      'image2pipe',
      '-vcodec',
      'png',
      '-'
    ]);

    const chunks: Buffer[] = [];
    let stderr = '';
    proc.stdout.on('data', (c: Buffer) => chunks.push(c));
    proc.stderr.on('data', (c: Buffer) => (stderr += c.toString()));
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code !== 0 || chunks.length === 0) {
        reject(new Error(`Poster frame extraction failed: ${stderr.trim() || `exit ${code}`}`));
        return;
      }
      resolve(Buffer.concat(chunks));
    });
  });
}

export interface FfmpegRunOptions {
  /** Called with 0..1 as the render advances. Requires totalDuration to be set. */
  onProgress?: (fraction: number) => void;
  /** Expected output duration in seconds — the denominator for progress. */
  totalDuration?: number;
  /** Resolves to true to abort the run (checked as progress arrives). */
  signal?: AbortSignal;
}

/**
 * Runs ffmpeg to completion, reporting progress.
 *
 * Uses `-progress pipe:1` (machine-readable key=value on stdout) rather than
 * scraping the human-readable stderr stat line, which is formatted for a
 * terminal and changes between ffmpeg versions.
 */
export function runFfmpeg(args: string[], options: FfmpegRunOptions = {}): Promise<string> {
  const { onProgress, totalDuration, signal } = options;

  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', ['-hide_banner', '-nostats', '-progress', 'pipe:1', ...args]);

    // ffmpeg's own log goes to stderr; keep it for error reporting. Capped so a
    // pathological run can't grow the buffer without bound.
    let log = '';
    const appendLog = (chunk: string) => {
      log = (log + chunk).slice(-16_000);
    };

    let progressBuf = '';
    proc.stdout.on('data', (c: Buffer) => {
      if (!onProgress || !totalDuration) return;
      progressBuf += c.toString();
      const lines = progressBuf.split('\n');
      progressBuf = lines.pop() ?? '';
      for (const line of lines) {
        const [key, value] = line.split('=');
        if (key === 'out_time_us' || key === 'out_time_ms') {
          // Despite the name, out_time_ms is microseconds in every ffmpeg
          // release that emits it — both keys are µs.
          const seconds = Number(value) / 1_000_000;
          if (Number.isFinite(seconds)) {
            onProgress(Math.min(1, Math.max(0, seconds / totalDuration)));
          }
        }
      }
    });

    proc.stderr.on('data', (c: Buffer) => appendLog(c.toString()));

    const onAbort = () => proc.kill('SIGKILL');
    signal?.addEventListener('abort', onAbort, { once: true });

    proc.on('error', (e) => {
      signal?.removeEventListener('abort', onAbort);
      reject(e);
    });

    proc.on('close', (code) => {
      signal?.removeEventListener('abort', onAbort);
      if (signal?.aborted) {
        reject(new Error('Render cancelled'));
        return;
      }
      if (code !== 0) {
        reject(new Error(`ffmpeg exited ${code}:\n${log.trim()}`));
        return;
      }
      resolve(log);
    });
  });
}

/**
 * Rasterises an SVG at a given pixel width, for logo/watermark overlays.
 * Falls back to sharp when rsvg-convert isn't installed — sharp's SVG support
 * is weaker on complex files but covers simple wordmark logos.
 */
export async function rasterizeSvg(svgPath: string, width: number): Promise<Buffer> {
  if (await hasBinary('rsvg-convert')) {
    const { stdout } = await execFileAsync('rsvg-convert', ['-w', String(width), svgPath], {
      encoding: 'buffer',
      maxBuffer: 64 * 1024 * 1024
    });
    return stdout as unknown as Buffer;
  }

  const sharp = (await import('sharp')).default;
  return sharp(svgPath, { density: 300 }).resize({ width }).png().toBuffer();
}
