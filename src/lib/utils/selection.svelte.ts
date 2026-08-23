import { SvelteSet } from 'svelte/reactivity';

/**
 * Multi-select state for an admin grid, shared by the media library and the
 * clips overview.
 *
 * The scope-taking methods exist because media paginates: "Select all" has
 * always meant the current page, and selecting page 2 must not silently drop
 * what you picked on page 1. Callers pass whatever rows are on screen, so a
 * grid without pagination just passes all of them.
 *
 * A SvelteSet rather than `$state(new Set())` — a plain Set isn't deeply
 * reactive, so the previous version rebuilt the whole set on every toggle just
 * to trigger an update.
 */
export class Selection {
  #ids = new SvelteSet<number>();

  get size(): number {
    return this.#ids.size;
  }

  /** The selected ids, for iterating when acting on them. */
  get ids(): number[] {
    return [...this.#ids];
  }

  has(id: number): boolean {
    return this.#ids.has(id);
  }

  toggle(id: number): void {
    if (this.#ids.has(id)) this.#ids.delete(id);
    else this.#ids.add(id);
  }

  clear(): void {
    this.#ids.clear();
  }

  /** Whether everything currently on screen is selected. */
  covers(scope: { id: number }[]): boolean {
    return scope.length > 0 && scope.every((item) => this.#ids.has(item.id));
  }

  /** Selects everything on screen, or clears it if it's already all selected. */
  toggleAll(scope: { id: number }[]): void {
    const selectAll = !this.covers(scope);
    for (const item of scope) {
      if (selectAll) this.#ids.add(item.id);
      else this.#ids.delete(item.id);
    }
  }
}
