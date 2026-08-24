<script lang="ts">
  /**
   * An inline calendar and 24-hour clock, formatted in the site's locale.
   *
   * `<input type="datetime-local">` looks tempting and was the first attempt,
   * but Chromium formats it from the *browser's* UI locale and ignores both the
   * `lang` attribute and any site setting — so a Norwegian admin on an English
   * browser gets `09/05/2026, 07:30 PM`, which is both AM/PM and ambiguous
   * about the month. Everything here goes through Intl instead.
   *
   * Inline rather than a popover on purpose. As a popover it had to dismiss on
   * an outside click, and inside a <dialog> that dismissal ate the very click
   * meant for the dialog's own buttons — first because a full-screen backdrop
   * covered them, then because removing the panel shifted the button out from
   * under the cursor before mouseup. A panel that is simply there has none of
   * those failure modes.
   */
  import { untrack } from 'svelte';

  let {
    value = '',
    locale = 'nb-NO',
    onchange
  }: {
    /** Local wall-clock time as `YYYY-MM-DDTHH:mm`, or '' for none. */
    value?: string;
    locale?: string;
    onchange: (value: string) => void;
  } = $props();

  const parsed = $derived(value ? new Date(value) : null);
  const valid = $derived(parsed && !Number.isNaN(parsed.getTime()) ? parsed : null);

  /**
   * The month on screen. Seeded once from the incoming value and then owned by
   * the arrows — deriving it would snap the view back to the selected month the
   * moment you paged forward and picked nothing.
   */
  let cursor = $state(
    untrack(() => (valid ? new Date(valid.getFullYear(), valid.getMonth(), 1) : new Date()))
  );

  const monthLabel = $derived(
    new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(cursor)
  );

  /**
   * Monday in most of Europe, Sunday in the US — the locale knows which.
   * `getWeekInfo` ships in every current browser but isn't in TypeScript's Intl
   * types yet, hence the cast; the fallback covers older engines.
   */
  const firstDay = $derived.by(() => {
    try {
      const info = (
        new Intl.Locale(locale) as Intl.Locale & { getWeekInfo?: () => { firstDay: number } }
      ).getWeekInfo?.();
      return info?.firstDay ?? 1;
    } catch {
      return 1;
    }
  });

  const weekdays = $derived.by(() => {
    const fmt = new Intl.DateTimeFormat(locale, { weekday: 'short' });
    // 2024-01-01 was a Monday, so this walks a known week.
    return Array.from({ length: 7 }, (_, i) =>
      fmt.format(new Date(2024, 0, 1 + ((firstDay - 1 + i) % 7)))
    );
  });

  /** The month's days, padded with blanks so the 1st lands under its weekday. */
  const grid = $derived.by(() => {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const lead = (new Date(year, month, 1).getDay() - firstDay + 7) % 7;
    const days = new Date(year, month + 1, 0).getDate();
    return [
      ...Array.from({ length: lead }, () => null),
      ...Array.from({ length: days }, (_, i) => i + 1)
    ];
  });

  const selectedDay = $derived(
    valid && valid.getFullYear() === cursor.getFullYear() && valid.getMonth() === cursor.getMonth()
      ? valid.getDate()
      : null
  );

  const today = new Date();
  const isToday = (day: number) =>
    today.getFullYear() === cursor.getFullYear() &&
    today.getMonth() === cursor.getMonth() &&
    today.getDate() === day;

  const hours = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
  const minutes = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'));

  const hour = $derived(valid ? String(valid.getHours()).padStart(2, '0') : '10');
  const minute = $derived(valid ? String(valid.getMinutes()).padStart(2, '0') : '00');

  function emit(y: number, m: number, d: number, h: string, min: string) {
    const pad = (n: number) => String(n).padStart(2, '0');
    onchange(`${y}-${pad(m + 1)}-${pad(d)}T${h}:${min}`);
  }

  function pickDay(day: number) {
    emit(cursor.getFullYear(), cursor.getMonth(), day, hour, minute);
  }

  function pickTime(h: string, min: string) {
    // Choosing a time before a date lands on today, so the value never holds a
    // time with no date.
    const base = valid ?? new Date();
    emit(base.getFullYear(), base.getMonth(), base.getDate(), h, min);
  }

  function shiftMonth(by: number) {
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + by, 1);
  }
</script>

<div class="rounded-lg border border-gray-700 bg-gray-800/50 p-3">
  <div class="mb-2 flex items-center justify-between">
    <button
      type="button"
      onclick={() => shiftMonth(-1)}
      aria-label="Previous month"
      class="rounded-md p-1.5 text-gray-400 hover:bg-gray-800 hover:text-white"
    >
      <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
      </svg>
    </button>
    <span class="text-sm font-medium text-white capitalize">{monthLabel}</span>
    <button
      type="button"
      onclick={() => shiftMonth(1)}
      aria-label="Next month"
      class="rounded-md p-1.5 text-gray-400 hover:bg-gray-800 hover:text-white"
    >
      <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
      </svg>
    </button>
  </div>

  <div class="grid grid-cols-7 gap-0.5 text-center">
    {#each weekdays as day (day)}
      <span class="py-1 text-[10px] text-gray-600 uppercase">{day}</span>
    {/each}
    {#each grid as day, i (i)}
      {#if day === null}
        <span></span>
      {:else}
        <button
          type="button"
          onclick={() => pickDay(day)}
          class="rounded-md py-1.5 text-xs tabular-nums transition-colors {day === selectedDay
            ? 'bg-violet-600 font-medium text-white'
            : isToday(day)
              ? 'text-violet-400 hover:bg-gray-800'
              : 'text-gray-300 hover:bg-gray-800'}"
        >
          {day}
        </button>
      {/if}
    {/each}
  </div>

  <div class="mt-3 flex items-center gap-2 border-t border-gray-800 pt-3">
    <span class="text-xs text-gray-500">Time</span>
    <select
      value={hour}
      onchange={(e) => pickTime(e.currentTarget.value, minute)}
      class="rounded-lg border border-gray-700 bg-gray-800 px-2 py-1 text-xs text-white tabular-nums"
    >
      {#each hours as h (h)}<option value={h}>{h}</option>{/each}
    </select>
    <span class="text-xs text-gray-500">:</span>
    <select
      value={minute}
      onchange={(e) => pickTime(hour, e.currentTarget.value)}
      class="rounded-lg border border-gray-700 bg-gray-800 px-2 py-1 text-xs text-white tabular-nums"
    >
      {#each minutes as m (m)}<option value={m}>{m}</option>{/each}
    </select>
  </div>
</div>
