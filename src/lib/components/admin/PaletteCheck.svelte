<script lang="ts">
  import { contrastRatio } from '$lib/utils/color';
  import type { ThemeSettings } from '$lib/server/settings';

  /**
   * Says when text can't be read.
   *
   * Only text. There was a check here for panels sitting too close to the
   * background, and it was wrong: a flat palette where surfaces are delineated
   * by their borders rather than their fill is a deliberate and perfectly good
   * design, and the panels this app draws carry a border for exactly that
   * reason. Warning about it made a style choice look like a mistake.
   *
   * Nobody intends unreadable text, though, and that failure is silent — text a
   * shade too close to its background doesn't look wrong, it looks like the
   * page didn't finish loading. So these three stay, and because they can't be
   * triggered on purpose there is nothing here to dismiss.
   *
   * It says nothing at all when the palette is fine. A checklist of green ticks
   * is noise on every visit for the sake of the one visit it matters.
   */
  let { palette }: { palette: ThemeSettings } = $props();

  type Check = {
    label: string;
    value: number;
    /** Below this the pair stops working. */
    floor: number;
    advice: string;
  };

  const checks = $derived.by((): Check[] => {
    const bg = palette.colorBg;

    return [
      {
        label: 'Text on Background',
        // WCAG AA for body text — the right measure for this pair, because it
        // is text, and legibility is what the ratio was built for.
        value: contrastRatio(palette.colorText, bg),
        floor: 4.5,
        advice: 'This is the main reading colour. Below 4.5:1 it becomes hard work on a phone.'
      },
      {
        label: 'Muted on Background',
        value: contrastRatio(palette.colorTextMuted, bg),
        // Lower on purpose: muted text is meant to recede, and holding it to
        // the same standard as body text would defeat the point of having it.
        floor: 3,
        advice:
          'Prices, dates and captions use this. It should be quieter than Text, not invisible.'
      },
      {
        label: 'Accent on Background',
        value: contrastRatio(palette.colorAccent, bg),
        floor: 3,
        advice:
          'Buttons and links are painted in Accent. If it sinks into the page nobody finds them.'
      }
    ];
  });

  const failing = $derived(checks.filter((check) => check.value < check.floor));
</script>

{#if failing.length > 0}
  <div class="mt-4 space-y-2 rounded-lg border border-amber-900/60 bg-amber-950/30 p-3">
    <p class="text-xs font-medium text-amber-400">
      {failing.length === 1 ? 'One colour is' : `${failing.length} colours are`} hard to read
    </p>
    {#each failing as check (check.label)}
      <div class="text-xs">
        <p class="text-amber-200/90">
          <!-- The number is included because it's the thing that moves as you
               drag the picker, so it tells you which way you're going. -->
          {check.label} — {check.value.toFixed(2)}:1
        </p>
        <p class="mt-0.5 text-gray-400">{check.advice}</p>
      </div>
    {/each}
  </div>
{/if}
