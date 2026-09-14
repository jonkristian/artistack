/**
 * Puts text in where the cursor is, and hands back what the field now says.
 *
 * An emoji appended to the end is an emoji in the wrong place — captions get
 * written around them, not after them. The element is updated as well as the
 * value returned, because the two fields this serves disagree about who owns
 * their contents: one is bound, the other reports on blur.
 */
export function insertAtCursor(el: HTMLTextAreaElement | HTMLInputElement, text: string): string {
  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? start;
  const next = el.value.slice(0, start) + text + el.value.slice(end);

  el.value = next;
  const caret = start + text.length;
  el.focus();
  el.setSelectionRange(caret, caret);

  return next;
}

/**
 * Whether a stored value is HTML or the plain text it used to be.
 *
 * Fields that grew a rich editor have older rows behind them written as plain
 * text with real line breaks. Rendering those through `{@html}` would run the
 * lines together, so the two are told apart and each drawn the way it was
 * written.
 */
export function looksLikeHtml(value: string): boolean {
  return /<[a-z][^>]*>/i.test(value);
}

/**
 * A name short enough to sit inside a sentence.
 *
 * For the middle of a line of prose — a toast, a confirmation — where the name
 * is there to identify what you just did to something, not to be read out. An
 * uploaded file arrives called `Første øving Rotvoll A57290EA-7CE5-45C6-8588-
 * AA3D6036D58C.mp4`, and a message carrying all of it is three lines of
 * identifier wrapped around four useful words.
 *
 * The tail is kept as well as the head, because the end of a filename is where
 * its extension is, and `…mp4` is worth more than three more characters of
 * UUID. Anything already short enough comes back untouched, so this never
 * mangles a name someone actually chose.
 */
export function shortName(value: string, max = 36): string {
  const name = value.trim();
  if (name.length <= max) return name;
  const tail = Math.min(8, Math.floor((max - 1) / 3));
  return `${name.slice(0, max - tail - 1)}…${name.slice(-tail)}`;
}
