/**
 * How loud the editor is, which is not part of the clip.
 *
 * The rendered file had a volume slider of its own, because a `<video controls>`
 * comes with one; the edit never did, so the two pictures disagreed about
 * something neither of them owns. Then Full lost its native controls and there
 * was nowhere to turn anything down at all.
 *
 * Deliberately not in the clip's config: nothing here reaches the render. It is
 * the level in this room, on this pair of headphones, and it should be the same
 * whichever picture is up and whichever clip is open — which is why it is a
 * module rather than state on a page.
 *
 * Kept in `localStorage` for the same reason: a monitoring level that resets
 * every time the tab reloads is one you end up setting again all day.
 */
const KEY = 'artistack:monitor';

class Monitor {
  #level = $state(1);
  #muted = $state(false);

  constructor() {
    if (typeof localStorage === 'undefined') return;
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}');
      if (typeof saved.level === 'number') this.#level = Math.min(1, Math.max(0, saved.level));
      this.#muted = Boolean(saved.muted);
    } catch {
      // A setting nobody can read is a setting at its default.
    }
  }

  #keep(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(KEY, JSON.stringify({ level: this.#level, muted: this.#muted }));
    } catch {
      // Private mode, a full quota: the level still works for this session.
    }
  }

  /** What to multiply any element's volume by. Zero while muted. */
  get level(): number {
    return this.#muted ? 0 : this.#level;
  }

  /** Where the slider sits, which is where it was left even while muted. */
  get setting(): number {
    return this.#level;
  }

  get muted(): boolean {
    return this.#muted;
  }

  /**
   * Moving the slider unmutes.
   *
   * Dragging a muted slider and hearing nothing is the kind of control people
   * decide is broken.
   */
  set(level: number): void {
    this.#level = Math.min(1, Math.max(0, level));
    if (this.#level > 0) this.#muted = false;
    this.#keep();
  }

  toggle(): void {
    this.#muted = !this.#muted;
    this.#keep();
  }
}

export const monitor = new Monitor();
