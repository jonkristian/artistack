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

let current = $state<Autosave | null>(null);

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

  /** Called by the page that owns it; returns its own teardown. */
  register(autosave: Autosave) {
    current = autosave;
    return () => {
      if (current === autosave) current = null;
    };
  }
};
