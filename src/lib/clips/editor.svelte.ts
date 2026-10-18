/**
 * What's selected in the clip editor.
 *
 * It existed three times over: the page held the open source and the open bed,
 * the timeline held which caption Delete would take, and the drawer held which
 * block had its settings out. Three facts that are really one — "the thing I am
 * working on" — and they could disagree, which is how a block came to be ringed
 * on the strip while a different row was open under it.
 *
 * One owner, so the strip, the preview and the tools all read the same answer.
 * Nothing in here touches the server or the draft: this is which thing, not
 * what it says.
 *
 * Kept in a module rather than passed down because everything that cares sits
 * at a different depth — the strip is a sibling of the preview, the tools will
 * be a sibling of both, and threading it through each would be a prop at every
 * floor for a fact that belongs to none of them.
 */

/**
 * A row carries an id; a caption or an effect is an entry in the clip's own
 * list, so it is named by where it sits. The names are the timeline's, because
 * renaming shot and bed is its own job and this one shouldn't carry it.
 */
export type ClipSelection =
  | { kind: 'clip'; id: number }
  | { kind: 'audio'; id: number }
  | { kind: 'caption'; index: number }
  | { kind: 'fx'; index: number };

class EditorSelection {
  #current = $state<ClipSelection | null>(null);
  /** Which clip it belongs to, so it can't survive into a different one. */
  #project: number | null = null;

  get current(): ClipSelection | null {
    return this.#current;
  }

  /** Whether exactly this thing is selected — a row by id, a list entry by index. */
  has(kind: ClipSelection['kind'], key: number): boolean {
    const chosen = this.#current;
    if (!chosen || chosen.kind !== kind) return false;
    return 'id' in chosen ? chosen.id === key : chosen.index === key;
  }

  select(next: ClipSelection): void {
    this.#current = next;
  }

  clear(): void {
    this.#current = null;
  }

  /**
   * Opening a different clip clears it. An id means nothing in another edit,
   * and a stale one would ring a block that isn't the one it names.
   */
  forProject(id: number): void {
    if (this.#project === id) return;
    this.#project = id;
    this.#current = null;
  }
}

export const selection = new EditorSelection();
