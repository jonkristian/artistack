<script lang="ts">
  /**
   * How big a piece of text is drawn, as a choice with a dial behind it.
   *
   * A bare number field asked everyone to know what 92 meant before they could
   * type it — and the answer depends on the frame, which is not a thing to
   * hold in your head. The named sizes are the sane ones for this frame,
   * worked out from whatever the thing's own size happens to be, and the
   * slider is there for the times none of them is right.
   *
   * The number stays editable beside the slider, so the slider's reach is the
   * distance it can cover rather than the largest size there is.
   */
  import { Icon, ChevronDown } from 'svelte-hero-icons';
  import { openPopover } from './Popover.svelte';
  import Slider from './Slider.svelte';

  let {
    value = null,
    base,
    onchange
  }: {
    /** The size now, or null when it simply follows whatever surrounds it. */
    value?: number | null;
    /** What "normal" is here, in the same units: the thing's own size. */
    base: number;
    onchange: (size: number | null) => void;
  } = $props();

  /**
   * The sizes worth offering, as multiples of this frame's own.
   *
   * Multiples rather than numbers, because the same list has to make sense at
   * 1080 wide and at 1920 — and because "half again" is the thing anybody
   * actually means when they reach for a size.
   */
  const STEPS = [
    { label: 'Small', of: 0.75 },
    { label: 'Normal', of: 1 },
    { label: 'Big', of: 1.5 },
    { label: 'Huge', of: 2 },
    { label: 'Enormous', of: 3 }
  ];

  const steps = $derived(STEPS.map((step) => ({ ...step, px: Math.round(base * step.of) })));
  /** What the trigger says: a name when it is one of them, the number when it isn't. */
  const named = $derived(steps.find((step) => step.px === (value ?? base))?.label);

  const token = Symbol('size select');
  let open = $state(false);

  function setOpen(next: boolean) {
    open = next;
    if (next) openPopover.claim(token);
    else openPopover.release(token);
  }

  // Closes when another popover takes the floor, the way the colour wheels do.
  $effect(() => {
    if (open && !openPopover.holds(token)) setOpen(false);
  });
  $effect(() => () => openPopover.release(token));

  /** Normal is "nothing of its own", so picking it clears rather than sets. */
  const choose = (px: number) => {
    onchange(px === Math.round(base) ? null : px);
    setOpen(false);
  };
</script>

<div class="relative">
  <button
    type="button"
    onclick={() => setOpen(!open)}
    aria-expanded={open}
    title="Size"
    class="flex h-7 items-center gap-1 rounded px-1.5 text-xs text-gray-400 transition-colors hover:bg-gray-700/60 hover:text-gray-200"
  >
    {named ?? `${value ?? base} px`}
    <Icon src={ChevronDown} size="12" solid class="text-gray-500" />
  </button>

  {#if open}
    <!-- Clicking anywhere else puts it away, which is what a menu does. -->
    <button
      type="button"
      class="fixed inset-0 z-20 cursor-default"
      aria-label="Close size menu"
      onclick={() => setOpen(false)}
    ></button>

    <div
      class="absolute top-full left-0 z-30 mt-1 w-48 rounded-lg border border-gray-700 bg-gray-900 p-1 shadow-xl"
    >
      {#each steps as step (step.label)}
        <button
          type="button"
          onclick={() => choose(step.px)}
          class="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-xs transition-colors {step.px ===
          (value ?? base)
            ? 'bg-violet-600 text-white'
            : 'text-gray-300 hover:bg-gray-800'}"
        >
          <span>{step.label}</span>
          <span class="text-[10px] text-gray-400 tabular-nums">{step.px} px</span>
        </button>
      {/each}

      <!-- Anything else. The slider covers the sizes people reach for; the
           field beside it covers the rest, so the slider's end is how far it
           reaches rather than how big text may be. -->
      <div class="mt-1 border-t border-gray-800 px-2 pt-2 pb-1">
        <div class="flex items-center gap-2">
          <Slider
            value={value ?? base}
            min={Math.round(base * 0.5)}
            max={Math.round(base * 4)}
            label="Size"
            class="min-w-0 flex-1"
            onchange={(size) => onchange(size)}
          />
          <input
            type="number"
            min="1"
            value={value ?? base}
            aria-label="Size in pixels"
            class="w-14 shrink-0 rounded border border-gray-600 bg-gray-800 px-1.5 py-0.5 text-xs text-gray-50"
            onchange={(e) => {
              const asked = Number(e.currentTarget.value);
              onchange(Number.isFinite(asked) && asked > 0 ? Math.round(asked) : null);
            }}
          />
        </div>
      </div>
    </div>
  {/if}
</div>
