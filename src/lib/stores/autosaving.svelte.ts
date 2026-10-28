/**
 * Whether the page is saving, for the one place that says so.
 *
 * Two kinds of editor live in this admin. Most hold a draft and are published
 * with the Update button at the foot of the rail; the clip editor writes as
 * you go and said so with a chip floating over its own pane. Two answers to
 * "is my work safe", in two corners, and the one that mattered was the one
 * nobody was looking at.
 *
 * So the state meets the rail here, the same way the editor/preview switch
 * does: the page registers its autosave, the rail renders whichever is true.
 * Nothing is threaded through a slot and no component has to know about both.
 */
import type { Autosave } from '$lib/utils/autosave.svelte';

/**
 * What the rail needs to offer an undo, without knowing whose it is.
 *
 * The draft pages undo by throwing away unsaved changes; the clip editor
 * undoes by writing an earlier state back. Different mechanisms, same corner
 * of the screen and the same word — so the rail is handed two functions and
 * whether they can be pressed, and asks nothing else.
 */
export interface History {
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly undoLabel: string | null;
  readonly redoLabel: string | null;
  undo(): void | Promise<void>;
  redo(): void | Promise<void>;
}

let current = $state<Autosave | null>(null);

/*
 * `raw`, because this is an object of getters.
 *
 * Plain objects handed to `$state` are deeply proxied, and a proxy around
 * getters reads them at the wrong moment — the rail would be told whether undo
 * was available when the page registered rather than when it drew. The
 * autosave above escapes this by being a class instance, which `$state` leaves
 * alone.
 */
let currentHistory = $state.raw<History | null>(null);

export const autosaving = {
  /** The autosave on screen, if this page has one. */
  get now(): Autosave | null {
    return current;
  },

  /** True while a write is on its way, which is what the rail reports. */
  get saving(): boolean {
    return current?.saving ?? false;
  },

  get failure(): { what: string } | null {
    return current?.failure ?? null;
  },

  get savedAt(): number | null {
    return current?.savedAt ?? null;
  },

  /** The undo on screen, if this page has one that works step by step. */
  get history(): History | null {
    return currentHistory;
  },

  /** Called by the page that owns it; returns its own teardown. */
  register(autosave: Autosave, history: History | null = null) {
    current = autosave;
    currentHistory = history;
    return () => {
      if (current === autosave) current = null;
      if (currentHistory === history) currentHistory = null;
    };
  }
};
