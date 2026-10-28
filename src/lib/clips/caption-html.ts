/**
 * What a caption is written in.
 *
 * Plain text with three tags in it — `<b>`, `<i>`, `<s>` — and newlines left
 * as newlines, because the only markup this editor has ever had is a line
 * break and there is no reason for `<br>` to exist beside `\n`.
 *
 * HTML rather than a shape of our own because the editor is a
 * `contenteditable`, and that speaks HTML whether we want it to or not. What
 * it says, though, is whatever the browser feels like saying: `<span
 * style="font-weight: 700">`, stray `<div>`s, `&nbsp;`, and a paste from a web
 * page drags in anything at all. So nothing downstream ever sees that — it is
 * normalised at the boundary, on the way in, and everything after this file
 * may assume the three tags and nothing else.
 *
 * Which matters more here than it usually would: the renderer has to turn this
 * into libass tags, and a `<span>` it doesn't understand would quietly come
 * out unstyled. Bold on screen, plain in the file, and nobody told.
 */

/** The only tags a caption may contain. */
const KEPT = new Set(['b', 'i', 's']);

/**
 * A size, in the frame's own pixels.
 *
 * Which is libass's coordinate space as well — a render is 1080 wide and the
 * subtitle script is told so — meaning a size written here is `\fs` on one
 * side and a share of the frame's height on the other, with no conversion
 * either way and nothing to disagree about. A size in *screen* pixels would
 * mean one thing in a wide pane and another in a narrow one, and neither of
 * them what the file does.
 *
 * Only on text somebody deliberately resized. Everything else follows the
 * clip's own dial, so changing that still moves every caption that never
 * asked to be different.
 */
const SIZE = /font-size\s*:\s*(\d+(?:\.\d+)?)\s*px/;

/** What the browsers call them when they mean the same thing. */
const ALIASES: Record<string, string> = {
  strong: 'b',
  em: 'i',
  del: 's',
  strike: 's'
};

/** Tags that mean "a line ended here" rather than anything about the words. */
const BREAKS = new Set(['br', 'div', 'p']);

type Token =
  | { kind: 'text'; text: string }
  | { kind: 'open'; tag: string; size?: number }
  | { kind: 'close'; tag: string }
  | { kind: 'break' };

/**
 * Splits a fragment into text, the tags worth keeping, and line breaks.
 *
 * Anything else is dropped and its text kept: a caption pasted out of a web
 * page is still the words somebody pasted, and losing them because they
 * arrived wrapped in a `<span>` would be the wrong half to throw away.
 */
function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  const pattern = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g;
  /*
   * What is open, and what each one turned into.
   *
   * Kept so a closing tag can be matched to the element that opened it rather
   * than read on its own: `</span>` says nothing about whether that span was a
   * bold one, and deciding from the closing tag alone left the mark running on
   * to the end of the caption.
   */
  const stack: { name: string; tag: string | null }[] = [];
  let at = 0;

  for (let match = pattern.exec(input); match; match = pattern.exec(input)) {
    if (match.index > at) tokens.push({ kind: 'text', text: input.slice(at, match.index) });
    at = match.index + match[0].length;

    const closing = match[0].startsWith('</');
    const name = match[1].toLowerCase();
    const attrs = match[2] ?? '';

    // Not words at all, so its text goes with it — unlike a span's.
    if (name === 'script' || name === 'style') {
      if (!closing) {
        const end = input.toLowerCase().indexOf(`</${name}`, at);
        at = end === -1 ? input.length : end;
        pattern.lastIndex = at;
      }
      continue;
    }

    if (BREAKS.has(name)) {
      // An opening `<div>` ends the line before it; `<br>` ends its own.
      if (name === 'br' || !closing) tokens.push({ kind: 'break' });
      continue;
    }

    if (closing) {
      const depth = stack.map((entry) => entry.name).lastIndexOf(name);
      if (depth === -1) continue;
      // Everything inside it closes with it, which is what a browser means
      // even when the markup says otherwise.
      for (const entry of stack.splice(depth).reverse()) {
        if (entry.tag) tokens.push({ kind: 'close', tag: entry.tag });
      }
      continue;
    }

    const tag = ALIASES[name] ?? (KEPT.has(name) ? name : styled(name, attrs));
    // Self-closing, so there is nothing to keep on the stack for it.
    if (!/\/\s*$/.test(attrs)) stack.push({ name, tag });
    if (tag) tokens.push({ kind: 'open', tag, size: tag === 'size' ? sizeOf(attrs) : undefined });
  }

  if (at < input.length) tokens.push({ kind: 'text', text: input.slice(at) });
  for (const entry of stack.reverse()) {
    if (entry.tag) tokens.push({ kind: 'close', tag: entry.tag });
  }
  return tokens;
}

/**
 * A `<span>` that is really a mark.
 *
 * Browsers disagree about how to make text bold in a `contenteditable`: some
 * write `<b>`, some write a span with a style on it. The second is the same
 * decision wearing different clothes, so it is read rather than discarded.
 */
function styled(name: string, attrs: string): string | null {
  if (name !== 'span' && name !== 'font') return null;
  const style = attrs.toLowerCase();
  if (SIZE.test(style)) return 'size';
  if (/font-weight\s*:\s*(bold|[6-9]00)/.test(style)) return 'b';
  if (/font-style\s*:\s*italic/.test(style)) return 'i';
  if (/text-decoration[^;]*line-through/.test(style)) return 's';
  return null;
}

/**
 * The number in a `font-size`, in whole frame pixels.
 *
 * No ceiling. Text bigger than the frame is something somebody asked for, and
 * the preview shows exactly what that does — a clamp would hand back a number
 * nobody typed and say nothing about it. Only nonsense is refused: a size has
 * to be a positive number to be a size at all.
 */
function sizeOf(attrs: string): number | undefined {
  const found = SIZE.exec(attrs.toLowerCase());
  if (!found) return undefined;
  const px = Math.round(Number(found[1]));
  return Number.isFinite(px) && px > 0 ? px : undefined;
}

/** `&amp;` and friends, which a `contenteditable` produces freely. */
function decode(text: string): string {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/** The three characters that would otherwise be read as markup. */
function escape(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Whatever came out of the editor, as the three tags and newlines.
 *
 * Tags are closed in the order they were opened, however badly they were
 * nested on the way in, and anything left open at the end is closed here — so
 * what is stored always parses, whatever the browser did.
 */
/** A mark that is open, and — for a size — what number it carries. */
type Mark = { tag: string; size?: number };

const opening = (mark: Mark): string =>
  mark.tag === 'size' ? `<span style="font-size: ${mark.size}px">` : `<${mark.tag}>`;

const closing = (mark: Mark): string => (mark.tag === 'size' ? '</span>' : `</${mark.tag}>`);

export function normaliseCaptionHtml(input: string): string {
  const open: Mark[] = [];
  let out = '';

  const close = (tag: string) => {
    const depth = open.map((mark) => mark.tag).lastIndexOf(tag);
    if (depth === -1) return;
    /*
     * Unwind to it and put back whatever was inside — innermost first, or the
     * output says `<b><i></b></i>`, which is what came in and the reason this
     * exists. A size goes back with its own number, so the words after an
     * inner size return to the size around them rather than to the caption's.
     */
    const [target, ...inside] = open.splice(depth);
    for (const mark of [...inside].reverse()) out += closing(mark);
    out += closing(target);
    for (const mark of inside) {
      out += opening(mark);
      open.push(mark);
    }
  };

  for (const token of tokenize(input.replace(/\r/g, ''))) {
    if (token.kind === 'text') out += escape(decode(token.text));
    // A line that has not begun cannot end: an opening `<div>` wrapping the
    // first line would otherwise push the whole caption down one.
    else if (token.kind === 'break') out += out === '' || out.endsWith('\n') ? '' : '\n';
    else if (token.kind === 'open') {
      // A size with no number is a span that said nothing.
      if (token.tag === 'size' && token.size === undefined) continue;
      // Already in it, and saying the same thing: nothing to say twice. A
      // different size inside one is a real nesting and keeps both.
      if (token.tag !== 'size' && open.some((mark) => mark.tag === token.tag)) continue;
      const mark: Mark = { tag: token.tag, size: token.size };
      out += opening(mark);
      open.push(mark);
    } else close(token.tag);
  }

  for (const mark of [...open].reverse()) out += closing(mark);

  // Trailing blank lines are what an empty last line of a contenteditable
  // looks like, and they place the caption a line higher than it reads.
  return out.replace(/\n+$/, '');
}

/** The words alone: for a block's label, a post sheet, anything counting characters. */
export function captionText(html: string): string {
  let out = '';
  for (const token of tokenize(html.replace(/\r/g, ''))) {
    if (token.kind === 'text') out += decode(token.text);
    else if (token.kind === 'break') out += '\n';
  }
  return out;
}

/**
 * The same caption in libass's language.
 *
 * `{` opens an override block there, so a caption containing one would have
 * swallowed the rest of itself — escaped here, which is a bug fixed on the way
 * past rather than a feature. Newlines become `\N`, the hard break, because a
 * caption written across two lines is drawn across two.
 */
export function captionAss(html: string, base: number): string {
  const depth: Record<string, number> = { b: 0, i: 0, s: 0 };
  const tag: Record<string, string> = { b: 'b', i: 'i', s: 's' };
  /*
   * Sizes, innermost last.
   *
   * `\fs` is absolute, so leaving one means going back to the size around it
   * rather than turning something off — and the outermost "size around it" is
   * the style's own, which is what `\fs0`… would not say. The caller passes
   * the caption's own size in, and that is what the stack starts with.
   */
  const sizes: number[] = [];
  let out = '';

  for (const token of tokenize(html.replace(/\r/g, ''))) {
    if (token.kind === 'text') {
      out += decode(token.text)
        .replace(/\\/g, '\\\\')
        .replace(/\{/g, '\\{')
        .replace(/\}/g, '\\}')
        // A newline typed into a caption is the same hard break a `<br>` is.
        .replace(/\n/g, '\\N');
    } else if (token.kind === 'break') {
      out += '\\N';
    } else if (token.kind === 'open') {
      if (token.tag === 'size') {
        if (token.size === undefined) continue;
        sizes.push(token.size);
        out += `{\\fs${token.size}}`;
        continue;
      }
      depth[token.tag] = (depth[token.tag] ?? 0) + 1;
      if (depth[token.tag] === 1) out += `{\\${tag[token.tag]}1}`;
    } else {
      if (token.tag === 'size') {
        if (!sizes.length) continue;
        sizes.pop();
        // Back to whatever was around it: a size further out, or the style's.
        out += sizes.length ? `{\\fs${sizes[sizes.length - 1]}}` : `{\\fs${base}}`;
        continue;
      }
      if (!depth[token.tag]) continue;
      depth[token.tag] -= 1;
      if (depth[token.tag] === 0) out += `{\\${tag[token.tag]}0}`;
    }
  }

  return out;
}

/** Whether a caption says anything at all, markup aside. */
export function captionIsEmpty(html: string | undefined | null): boolean {
  return !captionText(html ?? '').trim();
}
