/**
 * Client-side upload helper.
 *
 * Images and videos take different server routes — images are buffered and run
 * through sharp, videos are streamed to disk — so callers shouldn't have to
 * know which endpoint to hit. This picks based on the file type and returns the
 * same shape either way.
 */

export interface UploadResult {
  url: string;
  originalUrl?: string;
  thumbnailUrl?: string;
  mimeType: string;
  width?: number;
  height?: number;
  size?: number;
  originalSize?: number;
  durationMs?: number;
}

/**
 * `accept` filters for the native file dialog.
 *
 * Extensions are listed alongside the MIME types on purpose. The OS mapping is
 * not what the spec suggests: Linux reports `.wav` as `audio/x-wav` and `.m4a`
 * as `audio/x-m4a`, so a MIME-only filter hides those files from the picker
 * entirely — the user sees an empty folder and assumes the format is
 * unsupported. An extension is matched literally, so it always works.
 *
 * Being generous here is safe: the server identifies every upload by magic
 * bytes, so a loose dialog filter can't let an unsupported file through.
 *
 * Defined once because the picker and the media page previously kept their own
 * copies and drifted apart — which is how the WAV gap appeared.
 */
export const ACCEPT_IMAGE =
  'image/jpeg,image/png,image/webp,image/gif,image/svg+xml,.jpg,.jpeg,.png,.webp,.gif,.svg';

export const ACCEPT_VIDEO = 'video/mp4,video/quicktime,video/webm,.mp4,.mov,.m4v,.webm';

export const ACCEPT_AUDIO =
  'audio/wav,audio/x-wav,audio/wave,audio/vnd.wave,audio/mpeg,audio/mp3,' +
  'audio/mp4,audio/x-m4a,audio/aac,audio/flac,audio/x-flac,audio/ogg,application/ogg,' +
  '.wav,.mp3,.m4a,.flac,.ogg,.oga';

/**
 * Extension fallbacks for the type checks below.
 *
 * `file.type` is whatever the OS decided, and it is not dependable — some
 * exports arrive as `application/octet-stream`, and some arrive with no type at
 * all. Refusing those before upload means a perfectly valid clip is rejected
 * with a message saying its format isn't supported, which is a confusing dead
 * end. Trusting the name here is safe because the server identifies the file by
 * magic bytes and rejects it there if it really is the wrong thing.
 */
const VIDEO_EXT = /\.(mp4|mov|m4v|webm)$/i;
const AUDIO_EXT = /\.(wav|mp3|m4a|flac|ogg|oga)$/i;
const IMAGE_EXT = /\.(jpe?g|png|webp|gif|svg)$/i;

export function isVideoFile(file: File): boolean {
  return file.type.startsWith('video/') || VIDEO_EXT.test(file.name);
}

export function isAudioFile(file: File): boolean {
  return file.type.startsWith('audio/') || AUDIO_EXT.test(file.name);
}

export function isImageFile(file: File): boolean {
  return file.type.startsWith('image/') || IMAGE_EXT.test(file.name);
}

/** Video and audio both take the streaming route; images are buffered. */
export function isStreamedFile(file: File): boolean {
  return isVideoFile(file) || isAudioFile(file);
}

/** Human-readable clip length, e.g. "1:04". */
export function formatDuration(ms: number | null | undefined): string {
  if (!ms || ms <= 0) return '';
  const total = Math.round(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/**
 * Uploads a file and returns its stored URLs and metadata.
 * Throws with the server's message when the upload is rejected.
 */
export async function uploadFile(file: File, type = 'media'): Promise<UploadResult> {
  if (isStreamedFile(file)) {
    // Raw body, so the server can stream it to disk without buffering.
    const res = await fetch(`/api/upload/stream?filename=${encodeURIComponent(file.name)}`, {
      method: 'POST',
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
      body: file
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || 'Upload failed');
    return res.json();
  }

  const formData = new FormData();
  formData.append('file', file);
  formData.append('type', type);

  const res = await fetch('/api/upload', { method: 'POST', body: formData });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || 'Upload failed');
  return res.json();
}
