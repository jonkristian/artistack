/**
 * The two halves of moving a time between a picker and the server.
 *
 * The picker works in `YYYY-MM-DDTHH:mm` with no zone in it, meaning the hour
 * someone sees on their own clock. The server stores an instant. Only the
 * browser knows which zone the person is in, so both conversions happen there:
 * sent as it stood, the server read it in its own zone — UTC in production —
 * and an hour picked as 16:00 came back as 18:00.
 */

/** An instant as the picker wants it: local parts, no zone. */
export function toLocalInput(value: Date | string | null | undefined): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** And back: the picker's local parts as an absolute instant. */
export function fromLocalInput(value: string | null | undefined): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
