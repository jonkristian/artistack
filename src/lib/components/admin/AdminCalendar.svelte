<script lang="ts">
  /**
   * Everything with a date on it, a month at a time.
   *
   * A component rather than a page because it is the dashboard now: the plan is
   * the first thing worth seeing, and what has no date sits beside it in the
   * menu instead of taking a card each.
   */
  import { Icon, ChevronLeft, ChevronRight } from 'svelte-hero-icons';
  import { FilterSelect } from '$lib/components/ui';
  import type { Settings } from '$lib/server/settings';

  interface ShowLike {
    id: number;
    date: string;
    title: string | null;
    imageUrl: string | null;
    venue: { name?: string; city?: string } | null;
  }
  interface ReleaseLike {
    id: number;
    title: string;
    releaseDate: string | Date;
    coverUrl: string | null;
  }
  interface QueuedLike {
    id: number;
    name: string;
    eta: string | Date | null;
    dated: boolean;
    thumbnailUrl: string | null;
  }
  interface PublishedLike {
    id: number;
    name: string;
    publishedAt: string | Date | null;
    thumbnailUrl: string | null;
  }
  interface OrderLike {
    id: number;
    reference: string;
    buyerName: string | null;
    amount: number;
    currency: string;
    createdAt: string | Date | null;
    sent: boolean;
  }

  let {
    locale = 'nb-NO',
    settings,
    shows = [],
    releases = [],
    queue = [],
    publishedClips = [],
    orders = []
  }: {
    locale?: string;
    settings: Settings | null | undefined;
    shows?: ShowLike[];
    releases?: ReleaseLike[];
    queue?: QueuedLike[];
    publishedClips?: PublishedLike[];
    orders?: OrderLike[];
  } = $props();

  /**
   * What a day can hold.
   *
   * One shape for four sources, so a day is a list rather than four lists that
   * have to be merged at the point of drawing. `firm` is the distinction that
   * matters on a schedule: a show and a release are going to happen on their
   * date, while a queued clip's is worked out from its place in the queue and
   * changes whenever that does.
   */
  type Kind = 'show' | 'release' | 'clip' | 'order';

  interface Entry {
    key: string;
    kind: Kind;
    date: Date;
    title: string;
    detail: string | null;
    href: string;
    thumbnailUrl: string | null;
    firm: boolean;
    /** A job that's been done: drawn through, not dropped. */
    done?: boolean;
  }

  interface KindStyle {
    id: Kind;
    label: string;
    dot: string;
    /** The list's left hairline, where the grid uses a filled chip. */
    edge: string;
    chip: string;
    enabled: boolean;
  }

  const KINDS: KindStyle[] = $derived(
    (
      [
        {
          id: 'show',
          label: 'Shows',
          dot: 'bg-amber-400',
          edge: 'border-amber-500/50',
          chip: 'border-amber-500/40 bg-amber-500/10 text-amber-200',
          enabled: !!settings?.showsEnabled
        },
        {
          id: 'release',
          label: 'Releases',
          dot: 'bg-violet-400',
          edge: 'border-violet-500/50',
          chip: 'border-violet-500/40 bg-violet-500/10 text-violet-200',
          enabled: !!settings?.releasesEnabled
        },
        {
          id: 'clip',
          label: 'Clips',
          dot: 'bg-sky-400',
          edge: 'border-sky-500/50',
          chip: 'border-sky-500/40 bg-sky-500/10 text-sky-200',
          enabled: !!settings?.clipsEnabled
        },
        {
          id: 'order',
          label: 'Orders',
          dot: 'bg-emerald-400',
          edge: 'border-emerald-500/50',
          chip: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200',
          enabled: !!settings?.shopEnabled
        }
      ] satisfies KindStyle[]
    ).filter((k) => k.enabled)
  );

  const styleOf = $derived(new Map(KINDS.map((k) => [k.id, k])));

  /** Empty means everything, so there's no separate "all" to keep in sync. */
  let hidden = $state<Kind[]>([]);

  function toggle(kind: Kind) {
    hidden = hidden.includes(kind) ? hidden.filter((k) => k !== kind) : [...hidden, kind];
  }

  const allEntries = $derived.by(() => {
    const all: Entry[] = [];

    if (settings?.showsEnabled) {
      for (const show of shows) {
        all.push({
          key: `show-${show.id}`,
          kind: 'show',
          date: new Date(show.date),
          title: show.venue?.name || show.title || 'Show',
          detail: show.venue?.city ?? null,
          href: `/admin/shows/${show.id}`,
          thumbnailUrl: show.imageUrl ?? null,
          firm: true
        });
      }
    }

    if (settings?.releasesEnabled) {
      for (const release of releases) {
        all.push({
          key: `release-${release.id}`,
          kind: 'release',
          date: new Date(release.releaseDate),
          title: release.title,
          detail: null,
          href: `/admin/releases/${release.id}`,
          thumbnailUrl: release.coverUrl ?? null,
          firm: true
        });
      }
    }

    for (const clip of queue) {
      if (!clip.eta) continue;
      all.push({
        key: `clip-${clip.id}`,
        kind: 'clip',
        date: new Date(clip.eta),
        title: clip.name,
        detail: clip.dated ? 'on this date' : 'queued — date can still move',
        href: `/admin/clips/${clip.id}`,
        thumbnailUrl: clip.thumbnailUrl,
        // A date you chose holds; one worked out from the queue moves with it.
        firm: clip.dated
      });
    }

    for (const clip of publishedClips) {
      if (!clip.publishedAt) continue;
      all.push({
        key: `published-${clip.id}`,
        kind: 'clip',
        date: new Date(clip.publishedAt),
        title: clip.name,
        detail: 'out',
        href: `/admin/clips/${clip.id}`,
        thumbnailUrl: clip.thumbnailUrl,
        firm: true
      });
    }

    // Both sent and unsent: the calendar reads as a to-do, and a job that's
    // been done is struck through rather than removed.
    for (const order of orders) {
      all.push({
        key: `order-${order.id}`,
        kind: 'order',
        date: new Date(order.createdAt ?? Date.now()),
        title: order.buyerName || order.reference,
        detail: `${(order.amount / 100).toFixed(0)} ${order.currency}${order.sent ? ' · sent' : ''}`,
        href: `/admin/shop/orders`,
        thumbnailUrl: null,
        firm: true,
        done: order.sent
      });
    }

    return all.filter((e) => !Number.isNaN(e.date.getTime()));
  });

  const entries = $derived(allEntries.filter((e) => !hidden.includes(e.kind)));

  /*
   * How many of each kind are in the month being looked at — the menu lists a
   * kind with none so you can see it's empty rather than wonder where it went,
   * and disables it.
   */
  const monthCounts = $derived.by(() => {
    const counts = new Map<Kind, number>();
    for (const entry of allEntries) {
      if (entry.date.getMonth() !== viewing.getMonth()) continue;
      if (entry.date.getFullYear() !== viewing.getFullYear()) continue;
      counts.set(entry.kind, (counts.get(entry.kind) ?? 0) + 1);
    }
    return counts;
  });

  const filterOptions = $derived(
    KINDS.map((kind) => ({
      key: kind.id,
      label: kind.label,
      count: monthCounts.get(kind.id) ?? 0
    }))
  );

  /*
   * The menu speaks in what's shown; this component thinks in what's hidden.
   * Empty means everything on both sides, so nothing selected reads as "All"
   * rather than as four separate choices that happen to add up to all of them.
   */
  const filterSelected = $derived(
    hidden.length === 0 ? [] : KINDS.filter((k) => !hidden.includes(k.id)).map((k) => k.id)
  );

  function chooseFilters(next: string[]) {
    hidden = next.length === 0 ? [] : KINDS.filter((k) => !next.includes(k.id)).map((k) => k.id);
  }

  /* ---- the grid ------------------------------------------------------- */

  const today = new Date();
  let viewing = $state(new Date(today.getFullYear(), today.getMonth(), 1));

  function shiftMonth(by: number) {
    viewing = new Date(viewing.getFullYear(), viewing.getMonth() + by, 1);
  }

  const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

  const byDay = $derived.by(() => {
    const map = new Map<string, Entry[]>();
    for (const entry of entries) {
      const key = dayKey(entry.date);
      const list = map.get(key);
      if (list) list.push(entry);
      else map.set(key, [entry]);
    }
    for (const list of map.values()) list.sort((a, b) => a.date.getTime() - b.date.getTime());
    return map;
  });

  /**
   * Six weeks from the Monday on or before the first, which is enough for any
   * month and always the same height — a grid that grows a row in some months
   * moves everything below it as you page through.
   */
  const weeks = $derived.by(() => {
    const first = new Date(viewing.getFullYear(), viewing.getMonth(), 1);
    const start = new Date(first);
    // getDay() is 0 for Sunday; the week starts on Monday here.
    start.setDate(first.getDate() - ((first.getDay() + 6) % 7));

    return Array.from({ length: 6 }, (_, w) =>
      Array.from({ length: 7 }, (_, d) => {
        const date = new Date(start);
        date.setDate(start.getDate() + w * 7 + d);
        return date;
      })
    );
  });

  /**
   * The month as a list: the days that have something on them, in order.
   *
   * What a phone gets instead of the grid. Seven columns on a narrow screen is
   * a fortnight of panning to read a month, and the cells are too small for a
   * title either way — an agenda gives each entry a whole line and drops the
   * empty days, which on most months is most of them.
   *
   * The same entries, the same filters and the same month as the grid, so
   * moving between the two is a change of shape rather than of subject.
   */
  const agenda = $derived.by(() => {
    const days: { date: Date; items: Entry[] }[] = [];
    for (const week of weeks) {
      for (const day of week) {
        if (day.getMonth() !== viewing.getMonth()) continue;
        const items = byDay.get(dayKey(day));
        if (items?.length) days.push({ date: day, items });
      }
    }
    return days;
  });

  const agendaDay = $derived(
    new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short' })
  );

  const siblingMonth = (by: number) =>
    new Intl.DateTimeFormat(locale, { month: 'long' }).format(
      new Date(viewing.getFullYear(), viewing.getMonth() + by, 1)
    );

  const monthLabel = $derived(
    new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(viewing)
  );

  /**
   * The month in full with the year elided, for the row on a phone.
   *
   * The month is the part you read; the century isn't in question. Abbreviating
   * the month instead saves less and costs more — "sep." is a lookup, where
   * "September ’26" is just the date with four characters taken off the end.
   */
  const monthLabelShort = $derived(
    `${new Intl.DateTimeFormat(locale, { month: 'long' }).format(viewing)} ’${String(
      viewing.getFullYear()
    ).slice(-2)}`
  );

  const weekdayNames = $derived.by(() => {
    const fmt = new Intl.DateTimeFormat(locale, { weekday: 'short' });
    // Any Monday will do; this one is arbitrary and never shown.
    return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(2024, 0, 1 + i)));
  });

  const timeOf = $derived(new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }));

  const isSameDay = (a: Date, b: Date) => dayKey(a) === dayKey(b);
</script>

{#snippet monthNav()}
  <!--
    Today between the arrows rather than off on its own: all three do the same
    job — move the month — so they read as one control. Back a month, to this
    month, on a month.
  -->
  <div class="flex items-center gap-1">
    <button
      onclick={() => shiftMonth(-1)}
      aria-label="Previous month"
      class="rounded-lg border border-gray-800 bg-gray-900 p-2 text-gray-400 transition-colors hover:border-gray-700 hover:text-white"
    >
      <Icon src={ChevronLeft} size="16" />
    </button>
    <button
      onclick={() => (viewing = new Date(today.getFullYear(), today.getMonth(), 1))}
      class="rounded-lg border border-gray-800 bg-gray-900 px-3 py-2 text-xs whitespace-nowrap text-gray-400 transition-colors hover:border-gray-700 hover:text-white"
    >
      Today
    </button>
    <button
      onclick={() => shiftMonth(1)}
      aria-label="Next month"
      class="rounded-lg border border-gray-800 bg-gray-900 p-2 text-gray-400 transition-colors hover:border-gray-700 hover:text-white"
    >
      <Icon src={ChevronRight} size="16" />
    </button>
  </div>
  <!--
    Both spellings, one shown. Text can't be swapped by media query the way a
    class can, and a phone has no room for "September" beside three buttons and
    a filter.
  -->
  <h2 class="text-lg font-semibold text-white capitalize">
    <span class="sm:hidden">{monthLabelShort}</span>
    <span class="hidden sm:inline">{monthLabel}</span>
  </h2>
{/snippet}

<div>
  <!--
    One card, one nav, two bodies.

    The month you're looking at and the dates in it are one object, so the nav
    sits inside rather than floating above — and rendering it here rather than
    once per body means it exists once, instead of twice with CSS hiding
    whichever doesn't apply.

    The bodies: a list on a phone, the grid from sm up. One card for the month
    rather than one per day, and a row per entry rather than a bordered chip —
    a day of gigs was costing more in borders and padding than in text. The
    colour survives as the dot and a hairline down the left, which is as much
    as a coloured box was saying.
  -->
  <div class="rounded-xl border border-gray-800 bg-gray-900">
    <!--
      Nav and filters on one row. There was a bar above holding nothing but the
      filters once the nav moved into the card, and a row holding one thing is
      a row better spent elsewhere. Filters keep to the right, where Today used
      to sit; on a phone they wrap onto their own line and spread across it.
    -->
    <div class="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-gray-800 px-3 py-2.5">
      {@render monthNav()}

      <!--
        One menu on a phone, four pills from sm up. Different controls rather
        than the same one restyled: four pills is a legend you can read at a
        glance where there's room, and a line of wrapped chips where there
        isn't. The menu carries counts, which the pills have no room for.
      -->
      <div class="ml-auto sm:hidden">
        <FilterSelect
          options={filterOptions}
          selected={filterSelected}
          total={allEntries.length}
          allLabel="All"
          compact
          align="right"
          onchange={chooseFilters}
        />
      </div>

      <div class="ml-auto hidden flex-wrap justify-end gap-2 sm:flex">
        {#each KINDS as kind (kind.id)}
          {@const off = hidden.includes(kind.id)}
          <button
            onclick={() => toggle(kind.id)}
            class="flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition-colors {off
              ? 'border-gray-800 bg-gray-900 text-gray-600'
              : kind.chip}"
            aria-pressed={!off}
          >
            <span class="h-2 w-2 rounded-full {off ? 'bg-gray-700' : kind.dot}"></span>
            {kind.label}
          </button>
        {/each}
      </div>
    </div>

    <div class="px-3 sm:hidden">
      {#if agenda.length === 0}
        <p class="py-8 text-center text-sm text-gray-600">Nothing this month</p>
      {:else}
        {#each agenda as { date, items }, i (date.toISOString())}
          {@const todays = isSameDay(date, today)}
          <div class={i > 0 ? 'border-t border-gray-800/70' : ''}>
            <div
              class="pt-2.5 pb-1 text-xs capitalize {todays
                ? 'font-semibold text-violet-400'
                : 'text-gray-500'}"
            >
              {agendaDay.format(date)}{todays ? ' · today' : ''}
            </div>

            <div class="flex flex-col pb-1.5">
              {#each items as entry (entry.key)}
                {@const style = styleOf.get(entry.kind)}
                <a
                  href={entry.href}
                  class="flex items-center gap-2 border-l-2 py-1.5 pl-2.5 transition-colors hover:bg-gray-800/60 {style?.edge ??
                    ''} {entry.firm ? '' : 'border-dashed'} {entry.done ? 'opacity-50' : ''}"
                >
                  {#if entry.thumbnailUrl}
                    <img
                      src={entry.thumbnailUrl}
                      alt=""
                      loading="lazy"
                      class="h-5 w-5 shrink-0 rounded-xs object-cover"
                    />
                  {:else}
                    <span class="h-1.5 w-1.5 shrink-0 rounded-full {style?.dot ?? ''}"></span>
                  {/if}
                  <span
                    class="min-w-0 flex-1 truncate text-sm text-gray-200 {entry.done
                      ? 'line-through'
                      : ''}"
                  >
                    {entry.title}
                  </span>
                  {#if entry.detail}
                    <span class="shrink-0 text-xs text-gray-600">{entry.detail}</span>
                  {/if}
                </a>
              {/each}
            </div>
          </div>
        {/each}
      {/if}

      <!--
      The same two steps again at the end.

      The nav at the top is off the screen once you've scrolled a month of
      dates, and scrolling back up to move on a month is the kind of small tax
      that stops you browsing. Named rather than arrows alone: at the bottom of
      August, the useful thing to say is "September", not "next".
    -->
      <div class="flex gap-2 border-t border-gray-800 py-2.5">
        <button
          onclick={() => shiftMonth(-1)}
          class="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-gray-800 px-3 py-2 text-sm text-gray-400 capitalize transition-colors hover:border-gray-700 hover:text-white"
        >
          <Icon src={ChevronLeft} size="14" />
          {siblingMonth(-1)}
        </button>
        <button
          onclick={() => shiftMonth(1)}
          class="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-gray-800 px-3 py-2 text-sm text-gray-400 capitalize transition-colors hover:border-gray-700 hover:text-white"
        >
          {siblingMonth(1)}
          <Icon src={ChevronRight} size="14" />
        </button>
      </div>
    </div>

    <!--
      The grid still needs a floor below which its columns stop being readable —
      a tablet is narrower than seven usable columns even though it isn't a
      phone — so it scrolls to that width rather than compressing past it.
    -->
    <div class="hidden overflow-x-auto rounded-b-xl sm:block">
      <div class="min-w-[46rem]">
        <div class="grid grid-cols-7 border-b border-gray-800">
          {#each weekdayNames as name (name)}
            <div class="px-2 py-2 text-center text-xs text-gray-500 capitalize">{name}</div>
          {/each}
        </div>

        <div class="grid grid-cols-7">
          {#each weeks as week, w (w)}
            {#each week as day (day.toISOString())}
              {@const outside = day.getMonth() !== viewing.getMonth()}
              {@const todays = isSameDay(day, today)}
              {@const items = byDay.get(dayKey(day)) ?? []}
              <div
                class="min-h-28 border-r border-b border-gray-800/70 p-1.5 last:border-r-0 {outside
                  ? 'bg-gray-950/40'
                  : ''}"
              >
                <div class="mb-1 flex items-center justify-between px-0.5">
                  <span
                    class="grid h-5 min-w-5 place-items-center rounded-full text-xs {todays
                      ? 'bg-violet-600 font-semibold text-white'
                      : outside
                        ? 'text-gray-700'
                        : 'text-gray-500'}"
                  >
                    {day.getDate()}
                  </span>
                </div>

                <div class="flex flex-col gap-1">
                  {#each items as entry (entry.key)}
                    {@const style = styleOf.get(entry.kind)}
                    <a
                      href={entry.href}
                      title="{entry.title}{entry.detail
                        ? ` · ${entry.detail}`
                        : ''} · {timeOf.format(entry.date)}"
                      class="flex items-center gap-1.5 rounded border px-1.5 py-1 text-[11px] leading-tight transition-opacity hover:opacity-80 {style?.chip ??
                        ''} {entry.firm ? '' : 'border-dashed'} {entry.done ? 'opacity-50' : ''}"
                    >
                      {#if entry.thumbnailUrl}
                        <img
                          src={entry.thumbnailUrl}
                          alt=""
                          loading="lazy"
                          class="h-4 w-4 shrink-0 rounded-xs object-cover"
                        />
                      {:else}
                        <span class="h-1.5 w-1.5 shrink-0 rounded-full {style?.dot ?? ''}"></span>
                      {/if}
                      <span class="truncate {entry.done ? 'line-through' : ''}">{entry.title}</span>
                    </a>
                  {/each}
                </div>
              </div>
            {/each}
          {/each}
        </div>
      </div>
    </div>
  </div>
</div>
