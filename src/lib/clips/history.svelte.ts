/**
 * What the clip looked like before each thing you did.
 *
 * A stack of snapshots rather than a stack of inverse operations. The whole
 * argument is in `notes/clip-editor-redesign.md` §11; the short version is that
 * an inverse per write has to be remembered again every time a column is added,
 * and this editor has already shipped one that quietly forgot eight of them.
 *
 * The stack holds the state *before* a gesture and the state *after* it, so
 * undo and redo are the same operation pointed in opposite directions. Nothing
 * here writes: it hands a snapshot to whoever asked, and that caller does the
 * writing. Which keeps this testable and keeps the one place that talks to the
 * server still being the one place.
 */
import type { ClipSnapshot } from '$lib/server/clip-snapshot';

export interface Step {
  /** What the gesture was, in the words the autosave already uses. */
  label: string;
  before: ClipSnapshot;
  after: ClipSnapshot;
  /** When it landed, for deciding whether the next one is the same gesture. */
  at: number;
}

/**
 * How deep it goes.
 *
 * Fifty is far more than anyone reaches for in one sitting, and a clip's
 * snapshot is a few kilobytes of rows — so the ceiling is about not growing
 * without bound over a long session rather than about memory in practice.
 */
const DEPTH = 50;

/**
 * How long two steps with the same name count as one gesture.
 *
 * A drag commits once and is already a single step. A text field that saves as
 * you type is several, and undoing a sentence one debounce at a time is not
 * undo, it is a stutter. Consecutive steps carrying the same label inside this
 * window are merged — the first one's `before` is kept, the last one's `after`
 * replaces the rest.
 */
const SAME_GESTURE_MS = 1200;

export class ClipHistory {
  #past = $state<Step[]>([]);
  #future = $state<Step[]>([]);

  /**
   * True while an undo or redo is being applied.
   *
   * The writes those perform go through the same autosave as everything else,
   * so without this they would be recorded as new steps and undo would become
   * a way of undoing itself.
   */
  applying = $state(false);

  get canUndo(): boolean {
    return this.#past.length > 0;
  }

  get canRedo(): boolean {
    return this.#future.length > 0;
  }

  /** What pressing undo would take back, for saying so on the button. */
  get undoLabel(): string | null {
    return this.#past.at(-1)?.label ?? null;
  }

  get redoLabel(): string | null {
    return this.#future.at(-1)?.label ?? null;
  }

  /**
   * Records a gesture that has already happened.
   *
   * A step whose before and after are the same is dropped: a field blurred
   * without being changed, a colour set to the colour it already was. Those
   * are not edits, and a history full of them is a button you have to press
   * four times before anything moves.
   */
  push(label: string, before: ClipSnapshot, after: ClipSnapshot): void {
    if (this.applying) return;
    if (JSON.stringify(before) === JSON.stringify(after)) return;

    const now = Date.now();
    const last = this.#past.at(-1);

    if (last && last.label === label && now - last.at < SAME_GESTURE_MS) {
      // The same gesture, still going: keep where it started, move where it got to.
      this.#past = [...this.#past.slice(0, -1), { ...last, after, at: now }];
    } else {
      this.#past = [...this.#past, { label, before, after, at: now }].slice(-DEPTH);
    }

    // Doing something new is what makes a redo stale: the branch you were on
    // is no longer the branch you are on.
    this.#future = [];
  }

  /** The state to write back, and the step it came from. Null when there is none. */
  undo(): Step | null {
    const step = this.#past.at(-1);
    if (!step) return null;
    this.#past = this.#past.slice(0, -1);
    this.#future = [...this.#future, step];
    return step;
  }

  redo(): Step | null {
    const step = this.#future.at(-1);
    if (!step) return null;
    this.#future = this.#future.slice(0, -1);
    this.#past = [...this.#past, step];
    return step;
  }

  /** Opening another clip starts again: a snapshot belongs to one project. */
  clear(): void {
    this.#past = [];
    this.#future = [];
  }
}
