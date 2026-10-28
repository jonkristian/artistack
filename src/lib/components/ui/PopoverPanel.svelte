<script lang="ts">
  /**
   * A button and the panel it opens, placed against the window.
   *
   * The clip editor had two of these written out by hand — the colour wheel's,
   * and a branding dropdown that was a plain `absolute` list. The list is why
   * this exists: `absolute` is measured against the panel it sits in, so it
   * was clipped by the editor's own scroll, and which way it had to open
   * depended on where in that panel it happened to be. It opened upwards for
   * as long as branding sat at the foot of the rail, then off the top of the
   * screen the day branding moved to the head of it.
   *
   * `fixed` and measured, so it goes below if there is room and above if there
   * isn't, and never off an edge — wherever the thing that opens it has got to.
   *
   * Deliberately not claiming the one-popover-at-a-time floor the colour wheel
   * uses. A panel like this can hold a colour wheel, and the floor is a single
   * token: the wheel inside would take it from the panel around it and close
   * the thing it was opened from. An outside click already closes this, which
   * is the same rule where it can be told apart.
   */
  import { tick, type Snippet } from 'svelte';

  let {
    title,
    trigger,
    children,
    triggerClass = '',
    panelClass = 'w-72',
    prefer = 'below',
    onopen
  }: {
    /** What the button is, for its tooltip and its label. */
    title: string;
    /** What the button looks like. */
    trigger: Snippet<[{ open: boolean }]>;
    /** What opens out of it. */
    children: Snippet;
    triggerClass?: string;
    /** The panel's own width and padding, when the default doesn't suit. */
    panelClass?: string;
    /**
     * Which way to open when there is room either way.
     *
     * Below reads as "this belongs to the thing above it" and is right for
     * most of them. Above is for a trigger sitting over something you are
     * looking at — a transport above a timeline, where opening downwards
     * covers the work.
     */
    prefer?: 'below' | 'above';
    /** Told when it opens, for whoever needs to know which one is out. */
    onopen?: () => void;
  } = $props();

  let buttonEl = $state<HTMLButtonElement>();
  let panelEl = $state<HTMLDivElement>();
  let open = $state(false);
  let at = $state({ top: 0, left: 0 });

  /**
   * Below if it fits, above if it doesn't, and inside the window either way.
   *
   * Measured once the panel is real and guessed before then, because the first
   * placement happens in the same breath as the decision to show it.
   */
  function place() {
    if (!buttonEl) return;

    const rect = buttonEl.getBoundingClientRect();
    const gap = 8;
    const width = panelEl?.offsetWidth ?? 288;
    const height = panelEl?.offsetHeight ?? 320;

    const below = rect.bottom + gap;
    const above = rect.top - gap - height;
    let top: number;
    if (prefer === 'above') {
      // Above unless it would run off the top, in which case below is still
      // better than clamped against the edge of the window.
      top = above >= gap ? above : below;
    } else {
      top = below + height > window.innerHeight - gap ? above : below;
    }
    top = Math.max(gap, Math.min(top, window.innerHeight - height - gap));

    const left = Math.max(gap, Math.min(rect.left, window.innerWidth - width - gap));
    at = { top, left };
  }

  async function setOpen(next: boolean) {
    open = next;
    if (!next) return;
    onopen?.();
    place();
    // Again once it exists, with its real size rather than the guess.
    await tick();
    place();
  }

  function outside(e: MouseEvent) {
    const target = e.target as Node;
    // The click that opened it reaches the window too, and the button is not
    // outside itself.
    if (buttonEl?.contains(target) || panelEl?.contains(target)) return;
    open = false;
  }
</script>

<svelte:window
  onclick={outside}
  onresize={() => open && place()}
  onkeydown={(e) => {
    if (e.key === 'Escape' && open) open = false;
  }}
/>

<button
  bind:this={buttonEl}
  type="button"
  onclick={() => setOpen(!open)}
  {title}
  aria-label={title}
  aria-expanded={open}
  class={triggerClass}
>
  {@render trigger({ open })}
</button>

{#if open}
  <div
    bind:this={panelEl}
    class="fixed z-[100] rounded-xl border border-gray-600 bg-gray-900 p-3 shadow-2xl {panelClass}"
    style="top: {at.top}px; left: {at.left}px"
  >
    {@render children()}
  </div>
{/if}
