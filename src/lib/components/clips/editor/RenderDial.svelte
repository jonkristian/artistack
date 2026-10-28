<script lang="ts">
  /**
   * One render setting: its name, whether it has been moved off the default,
   * and the number itself.
   *
   * Lifted out of the clip page as-is. It is drawn in two places now — the
   * Advanced list and a branding stage's own popover — and the second one was
   * a snippet reaching into four of the page's variables, which is the shape a
   * thing takes just before it gets copied and the copies drift.
   *
   * The draft stays with the page rather than here. Typing in one of these
   * moves the preview as you type, and the preview is drawn from the page's
   * merged view of the config; a draft kept privately in here would be a
   * number only this field could see.
   */
  import { numberClass } from '$lib/utils/classes';
  import type { ClipAdvancedConfig } from '$lib/clips/types';

  let {
    field,
    saved,
    changed,
    oninput,
    onsave
  }: {
    field: { key: keyof ClipAdvancedConfig; label: string; step?: number; hint?: string };
    /** What the server last agreed to, which is what the field shows. */
    saved: number;
    /** Whether this has been moved off its default, for the dot beside the name. */
    changed: boolean;
    /** Each keystroke, so the preview can follow before the save lands. */
    oninput: (value: number) => void;
    /** On leaving the field. Answers false if the server kept the old value. */
    onsave: (value: number) => Promise<boolean>;
  } = $props();
</script>

<div class="flex items-center gap-3 py-2">
  <label class="min-w-0 flex-1 text-sm text-gray-400" for="adv-{field.key}">
    {field.label}
    {#if changed}
      <span class="text-link">•</span>
    {/if}
    {#if field.hint}
      <span class="mt-0.5 block text-xs text-gray-500">{field.hint}</span>
    {/if}
  </label>
  <input
    id="adv-{field.key}"
    type="number"
    step={field.step ?? 1}
    class="{numberClass} w-24 shrink-0"
    value={saved}
    oninput={(e) => {
      const raw = e.currentTarget.value;
      if (raw === '' || Number.isNaN(Number(raw))) return;
      oninput(Number(raw));
    }}
    onblur={async (e) => {
      const el = e.currentTarget;
      const raw = el.value;
      if (raw === '') return;
      const ok = await onsave(Number(raw));
      if (!ok) return;
      /*
       * The server has the last word on what this says.
       *
       * `value` is bound to the saved number, so a save that quietly kept the
       * old one leaves the expression unchanged and the field goes on showing
       * what you typed — which is how three dials missing from the save schema
       * looked exactly like three dials that worked.
       */
      el.value = String(saved);
    }}
  />
</div>
