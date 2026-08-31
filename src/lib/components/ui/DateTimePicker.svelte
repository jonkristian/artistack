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
   * Inline by default, because as a popover it had to dismiss on an outside
   * click, and inside a <dialog> that dismissal ate the very click meant for
   * the dialog's own buttons — first because a full-screen backdrop covered
   * them, then because removing the panel shifted the button out from under the
   * cursor before mouseup.
   *
   * `compact` overlays instead, for form fields on an ordinary page where a
   * calendar shoving the rest of the form down each time you open it is worse.
   * There's no backdrop and dismissal is on pointerdown, so neither failure
   * mode applies — but the dialogs deliberately don't use it.
   */
  import { untrack } from 'svelte';

  let {
    value = '',
    locale = 'nb-NO',
    mode = 'datetime',
    compact = false,
    onchange
  }: {
    /**
     * `YYYY-MM-DDTHH:mm` for datetime, `YYYY-MM-DD` for date, `HH:mm` for
     * time — matching what the field being edited actually stores.
     */
    value?: string;
    locale?: string;
    /** Which halves to show. A show's date and its doors are separate columns. */
    mode?: 'datetime' | 'date' | 'time';
    /**
     * Collapse the calendar behind the date it's showing, and open it over the
     * page rather than pushing everything below it down.
     */
    compact?: boolean;
    onchange: (value: string) => void;
  } = $props();

  const showCalendar = $derived(mode !== 'time');

  /** One panel, whichever halves it holds — so date and time look alike. */
  let open = $state(false);
  const panelVisible = $derived(!compact || open);
  const showClock = $derived(mode !== 'date');

  const valid = $derived.by(() => {
    if (!value) return null;

    if (mode === 'time') {
      // A bare `HH:mm` isn't a date any parser accepts, so it's hung on today.
      const [h, m] = value.split(':').map(Number);
      if (Number.isNaN(h)) return null;
      const d = new Date();
      d.setHours(h, Number.isNaN(m) ? 0 : m, 0, 0);
      return d;
    }

    const d = new Date(mode === 'date' ? `${value}T00:00` : value);
    return Number.isNaN(d.getTime()) ? null : d;
  });

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

  /** What the collapsed field shows, in the site's locale. */
  const valueLabel = $derived.by(() => {
    if (!valid) return mode === 'time' ? 'Pick a time' : 'Pick a date';

    const time = `${String(valid.getHours()).padStart(2, '0')}:${String(valid.getMinutes()).padStart(2, '0')}`;
    if (mode === 'time') return time;

    const date = new Intl.DateTimeFormat(locale, {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    }).format(valid);

    return mode === 'date' ? date : `${date}, ${time}`;
  });

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
    const date = `${y}-${pad(m + 1)}-${pad(d)}`;

    if (mode === 'date') onchange(date);
    else if (mode === 'time') onchange(`${h}:${min}`);
    else onchange(`${date}T${h}:${min}`);
  }

  function pickDay(day: number) {
    emit(cursor.getFullYear(), cursor.getMonth(), day, hour, minute);
    // Picking is the whole job of an open calendar, so it closes behind you.
    if (compact && mode === 'date') open = false;
  }

  function pickTime(h: string, min: string) {
    // Choosing a time before a date lands on today, so the value never holds a
    // time with no date.
    const base = valid ?? new Date();
    emit(base.getFullYear(), base.getMonth(), base.getDate(), h, min);
  }

  /*
   * Closing the overlay. Pointerdown rather than click, so the calendar is gone
   * before anything under it reacts, and Escape because a thing that covers the
   * page should answer to it.
   */
  let root = $state<HTMLElement | null>(null);

  $effect(() => {
    if (!compact || !open) return;

    const onPointerDown = (e: PointerEvent) => {
      if (root && !root.contains(e.target as Node)) open = false;
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') open = false;
    };

    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('keydown', onKey);
    };
  });

  /*
   * A time on its own is typed, not scrolled. Columns of hours and minutes are
   * fine as a detail of a calendar, but as a field of their own they're a long
   * scroll to say something you could have written in four keystrokes.
   *
   * Normalised on blur so typing isn't fought while it's half-finished:
   * `1930`, `19.30` and `19:30` all land on `19:30`, and out-of-range values
   * are clamped rather than rejected.
   */
  let timeText = $state(untrack(() => value));

  $effect(() => {
    // Follow the value when it changes from outside — a different show loaded,
    // or the field cleared elsewhere.
    timeText = value;
  });

  function commitTime(raw: string) {
    const pad = (n: number) => String(n).padStart(2, '0');

    /*
     * A separator means the parts are already split, so they're read as
     * written: `9:5` is five past nine. Only bare digits get read positionally
     * — otherwise `9:5` becomes `95`, which clamps to 23:00.
     */
    const split = raw.match(/^\s*(\d{1,2})\s*[:.]\s*(\d{1,2})\s*$/);

    let h: string;
    let m: string;

    if (split) {
      [, h, m] = split;
    } else {
      const digits = raw.replace(/\D/g, '').slice(0, 4);
      if (!digits) {
        timeText = '';
        onchange('');
        return;
      }
      h = digits.length <= 2 ? digits : digits.slice(0, digits.length - 2);
      m = digits.length <= 2 ? '0' : digits.slice(-2);
    }

    const next = `${pad(Math.min(23, Number(h)))}:${pad(Math.min(59, Number(m)))}`;
    timeText = next;
    onchange(next);
  }

  function shiftMonth(by: number) {
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + by, 1);
  }
</script>

{#if mode === 'time'}
  <!-- Typed, not scrolled. Numeric on a phone; normalised when you leave it. -->
  <input
    type="text"
    inputmode="numeric"
    maxlength="5"
    placeholder="00:00"
    value={timeText}
    oninput={(e) => (timeText = e.currentTarget.value)}
    onblur={(e) => commitTime(e.currentTarget.value)}
    onkeydown={(e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        commitTime(e.currentTarget.value);
      }
    }}
    class="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white tabular-nums transition-colors hover:border-gray-600 focus:border-violet-500 focus:outline-none"
  />
{:else}
  <div
    bind:this={root}
    class={compact ? 'relative' : 'rounded-lg border border-gray-700 bg-gray-800/50 p-3'}
  >
    {#if compact}
      <!-- Date and time are the same shape: a field showing its value, opening a
         panel. Two bare selects beside a proper date field looked unfinished. -->
      <button
        type="button"
        onclick={() => (open = !open)}
        class="flex w-full items-center justify-between gap-2 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white transition-colors hover:border-gray-600"
        aria-expanded={open}
      >
        <span class:text-gray-500={!valid}>{valueLabel}</span>
        <svg
          class="h-4 w-4 shrink-0 text-gray-500 transition-transform {open ? 'rotate-180' : ''}"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>
    {/if}

    {#if panelVisible}
      <!-- Over the page when compact, so opening it doesn't shove the rest of the
         form down and back up again. -->
      <div
        class={compact
          ? 'absolute top-full right-0 left-0 z-50 mt-1 min-w-max rounded-lg border border-gray-700 bg-gray-900 p-3 shadow-xl'
          : ''}
      >
        {#if showCalendar}
          <div class="mb-2 flex items-center justify-between">
            <button
              type="button"
              onclick={() => shiftMonth(-1)}
              aria-label="Previous month"
              class="rounded-md p-1.5 text-gray-400 hover:bg-gray-800 hover:text-white"
            >
              <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M15 19l-7-7 7-7"
                />
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
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M9 5l7 7-7 7"
                />
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
                  class="rounded-md py-1.5 text-xs tabular-nums transition-colors {day ===
                  selectedDay
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
        {/if}

        {#if showClock}
          <!-- Columns rather than selects: they match the day grid above, and a
             time on its own shouldn't look like a different kind of control. -->
          <div
            class="flex gap-2 {showCalendar ? 'mt-3 border-t border-gray-800 pt-3' : ''}"
            class:justify-center={!showCalendar}
          >
            <div class="max-h-40 w-14 overflow-y-auto rounded-md bg-gray-800/50 p-1">
              {#each hours as h (h)}
                <button
                  type="button"
                  onclick={() => pickTime(h, minute)}
                  class="block w-full rounded py-1 text-center text-xs tabular-nums transition-colors {h ===
                  hour
                    ? 'bg-violet-600 font-medium text-white'
                    : 'text-gray-300 hover:bg-gray-800'}"
                >
                  {h}
                </button>
              {/each}
            </div>
            <div class="max-h-40 w-14 overflow-y-auto rounded-md bg-gray-800/50 p-1">
              {#each minutes as m (m)}
                <button
                  type="button"
                  onclick={() => pickTime(hour, m)}
                  class="block w-full rounded py-1 text-center text-xs tabular-nums transition-colors {m ===
                  minute
                    ? 'bg-violet-600 font-medium text-white'
                    : 'text-gray-300 hover:bg-gray-800'}"
                >
                  {m}
                </button>
              {/each}
            </div>
          </div>
        {/if}
      </div>
    {/if}
  </div>
{/if}
