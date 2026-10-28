/**
 * Which popover is out, so that only one ever is.
 *
 * A popover is a thing the window has one of: opening the border's colour
 * while the text's colour is still open leaves two wheels side by side, both
 * claiming to be the thing you are setting. Each control knowing only about
 * itself is exactly why that happens, and no caller should have to coordinate
 * a rule that is true everywhere.
 *
 * A token rather than a boolean per control: whoever opens last holds it, and
 * everyone else notices they are no longer the one and closes.
 */
class OpenPopover {
  #held = $state<symbol | null>(null);

  /** Takes the floor, closing whatever had it. */
  claim(token: symbol): void {
    this.#held = token;
  }

  /** Gives it up, if this is the one holding it. */
  release(token: symbol): void {
    if (this.#held === token) this.#held = null;
  }

  /** Whether this one still has the floor. */
  holds(token: symbol): boolean {
    return this.#held === token;
  }
}

export const openPopover = new OpenPopover();
