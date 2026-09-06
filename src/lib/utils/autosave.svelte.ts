import { toast } from '$lib/stores/toast.svelte';

/**
 * Save state for an editor that has no Save button.
 *
 * The clip studio commits every change as you make it, which is the right
 * behaviour and was also completely unaccountable: the write was fired and
 * never awaited for anything but its result, so an expired session or a value
 * the server refused looked exactly like success. You found out on the next
 * reload, when the change wasn't there.
 *
 * So every write goes through `run`, and three things follow from that:
 *
 *   - a failure is said out loud, once, in the words of the thing that failed
 *   - the failed write is kept, so "Try again" is a button rather than a
 *     re-enactment of whatever you did to trigger it
 *   - the editor knows whether it is settled, which is what makes it safe to
 *     ask before closing the tab on an unsaved change
 *
 * Deliberately not a queue or a retry loop. A save that fails here fails
 * because the server said no or the network is gone, and hammering it helps
 * neither; the person is sitting right there and can decide.
 */
export class Autosave {
  #inFlight = $state(0);
  #failure = $state<{ what: string; retry: () => Promise<unknown> } | null>(null);
  /** When the last write landed, so the indicator can say so and then stop. */
  #savedAt = $state<number | null>(null);

  /** A write is on its way to the server. */
  get saving(): boolean {
    return this.#inFlight > 0;
  }

  /** The last write that didn't land, still waiting to be retried. */
  get failure(): { what: string } | null {
    return this.#failure ? { what: this.#failure.what } : null;
  }

  get savedAt(): number | null {
    return this.#savedAt;
  }

  /** Nothing in flight and nothing broken — safe to walk away from. */
  get settled(): boolean {
    return this.#inFlight === 0 && this.#failure === null;
  }

  /**
   * Runs a write, reporting it if it fails.
   *
   * `what` completes "Couldn't save …", so it reads as the thing rather than
   * the action: 'the caption', 'the trim points'.
   *
   * Returns undefined on failure rather than throwing, because every caller is
   * an event handler — a rejection there is an unhandled one, which is the
   * silence this exists to end. Callers that continue on to something else
   * should check the result.
   */
  async run<T>(what: string, write: () => Promise<T>): Promise<T | undefined> {
    this.#inFlight += 1;
    try {
      const result = await write();
      // Only the retried write clears the failure. A different field saving
      // fine says nothing about the one that didn't.
      if (this.#failure?.what === what) this.#failure = null;
      this.#savedAt = Date.now();
      return result;
    } catch (e) {
      this.#failure = { what, retry: write };
      const detail = e instanceof Error && e.message ? ` — ${e.message}` : '';
      toast.error(`Couldn't save ${what}${detail}`);
      return undefined;
    } finally {
      this.#inFlight -= 1;
    }
  }

  /** Runs the failed write again, as itself, so a second failure still reports. */
  async retry(): Promise<void> {
    const pending = this.#failure;
    if (!pending || this.saving) return;
    await this.run(pending.what, pending.retry);
  }

  /** Gives up on the failed write without retrying it. */
  dismiss(): void {
    this.#failure = null;
  }
}
