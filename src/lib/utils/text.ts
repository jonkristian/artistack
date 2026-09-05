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
