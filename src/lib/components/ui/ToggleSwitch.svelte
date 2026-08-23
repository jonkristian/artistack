<script lang="ts">
  /**
   * The sliding switch used across the admin, extracted from the copies that had
   * accumulated in Integrations, Appearance, Settings and the dialogs.
   *
   * `md` matches those standalone feature switches; `sm` is for controls sitting
   * inside a dense list row. Most callers already lay out their own label and
   * description on the left with the switch pushed right, so `hideLabel` keeps
   * `label` as the accessible name without drawing it twice.
   */
  export type ToggleAccent = 'violet' | 'blue' | 'indigo' | 'red';

  let {
    checked = $bindable(),
    label,
    onchange,
    size = 'sm',
    accent = 'violet',
    hideLabel = false,
    disabled = false
  }: {
    checked: boolean;
    /** The accessible name, and the visible text unless hideLabel is set. */
    label: string;
    onchange?: (checked: boolean) => void;
    size?: 'sm' | 'md';
    /**
     * The "on" colour. Not decoration in every case — red marks a show as sold
     * out, blue belongs to the Google integrations and indigo is Discord's own,
     * so those carry meaning and shouldn't be flattened to the default.
     */
    accent?: ToggleAccent;
    hideLabel?: boolean;
    disabled?: boolean;
  } = $props();

  // Written out in full: Tailwind scans source text, so an interpolated class
  // name would never make it into the stylesheet.
  const ACCENTS: Record<ToggleAccent, string> = {
    violet: 'bg-violet-600',
    blue: 'bg-blue-600',
    indigo: 'bg-indigo-600',
    red: 'bg-red-600'
  };

  const track = $derived(size === 'sm' ? 'h-4 w-7' : 'h-6 w-11');
  const knob = $derived(size === 'sm' ? 'h-3 w-3' : 'h-5 w-5');
  const shift = $derived(size === 'sm' ? 'translate-x-3' : 'translate-x-5');

  function toggle() {
    if (disabled) return;
    checked = !checked;
    onchange?.(checked);
  }
</script>

<button
  type="button"
  role="switch"
  aria-checked={checked}
  aria-label={label}
  {disabled}
  onclick={toggle}
  class="flex shrink-0 items-center gap-2 text-xs text-gray-400 disabled:cursor-not-allowed disabled:opacity-40"
>
  <span
    class="relative shrink-0 rounded-full transition-colors {track} {checked
      ? ACCENTS[accent]
      : 'bg-gray-700'}"
  >
    <span
      class="absolute top-0.5 left-0.5 rounded-full bg-white transition-transform {knob} {checked
        ? shift
        : ''}"
    ></span>
  </span>
  {#if !hideLabel}
    {label}
  {/if}
</button>
