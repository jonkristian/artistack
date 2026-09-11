<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { tick, untrack } from 'svelte';
  import { toast } from '$lib/stores/toast.svelte';
  import SetupCard from '$lib/components/admin/SetupCard.svelte';
  import ViewsChart from '$lib/components/admin/ViewsChart.svelte';
  import AdminCalendar from '$lib/components/admin/AdminCalendar.svelte';
  import WaitingMenu, { type WaitingItem } from '$lib/components/admin/WaitingMenu.svelte';
  import NewMenu, { type NewAction } from '$lib/components/admin/NewMenu.svelte';
  import * as draft from '$lib/stores/pageDraft.svelte';
  import { buildDraftFromServerData } from './publishDraft';
  import { CLIP_STATUS_LABELS, CLIP_STATUS_DOTS, type ClipStatus } from '$lib/clips/types';
  import { createProject } from './clips/data.remote';
  import { goto } from '$app/navigation';
  import { Icon, MusicalNote, Film, ArrowUpTray, CalendarDays } from 'svelte-hero-icons';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  /*
   * First-run setup lives here rather than on a page editor. It's about the
   * site existing at all, which is the dashboard's subject; the editor's is
   * one page's blocks.
   */
  let needsSetup = $state(untrack(() => !data.settings?.setupCompleted));

  async function handleSetupComplete() {
    await invalidateAll();
    await tick();
    // Re-initialize draft with new data (which now includes default blocks)
    draft.initialize(buildDraftFromServerData(data));
    needsSetup = false;
    toast.info('Setup complete! Start customizing your page.');
  }

  const locale = $derived(data.settings?.locale || 'nb-NO');

  /*
   * Where the chart builds its legend. The element has to exist before the plot
   * does, which it does: this renders above the chart.
   */
  let legendHost = $state<HTMLElement | null>(null);

  /*
   * What's waiting on you, with no date to be drawn on.
   *
   * The calendar covers everything that has one. This is the other half — clips
   * still being made, pages never published, parcels not sent — and it's one
   * list because they're one kind of thing: unfinished. It replaced a card
   * each, which said so four times and filled the screen doing it.
   */
  const waiting = $derived.by(() => {
    const items: WaitingItem[] = [];

    for (const clip of data.waitingClips ?? []) {
      items.push({
        key: `clip-${clip.id}`,
        kind: 'Clips',
        label: clip.name,
        detail: CLIP_STATUS_LABELS[clip.status as ClipStatus],
        href: `/admin/clips/${clip.id}`,
        thumbnailUrl: clip.thumbnailUrl,
        dot: CLIP_STATUS_DOTS[clip.status as ClipStatus]
      });
    }

    for (const order of (data.orders ?? []).filter((o) => !o.sent)) {
      items.push({
        key: `order-${order.id}`,
        kind: 'Orders',
        label: order.buyerName || order.reference,
        detail: `${Math.round(order.amount / 100)} ${order.currency} · not sent`,
        href: '/admin/shop/orders',
        thumbnailUrl: null,
        dot: 'bg-emerald-400'
      });
    }

    if (data.settings?.pagesEnabled) {
      for (const page of data.pages ?? []) {
        if (page.type !== 'custom' || page.published) continue;
        items.push({
          key: `page-${page.id}`,
          kind: 'Unpublished',
          label: page.title,
          detail: `/${page.slug}`,
          href: `/admin/pages/${page.id}`,
          thumbnailUrl: null,
          dot: 'bg-gray-500'
        });
      }
    }

    return items;
  });

  const productCount = $derived((data.products ?? []).length);

  /*
   * Creating a clip is one call — the name is a placeholder either way, so
   * there's nothing to ask for first. A release needs a title and a date, so
   * that one opens the form on its own page rather than guessing.
   */
  let creatingClip = $state(false);

  async function newClip() {
    if (creatingClip) return;
    creatingClip = true;
    try {
      const result = await createProject({ name: 'Untitled clip' });
      await goto(`/admin/clips/${result.project.id}`);
    } catch {
      toast.error('Could not create the clip');
    } finally {
      creatingClip = false;
    }
  }

  const newActions: NewAction[] = $derived(
    [
      data.settings?.releasesEnabled && {
        key: 'release',
        label: 'New release',
        href: '/admin/releases?new=1',
        icon: releaseIcon
      },
      data.settings?.clipsEnabled && {
        key: 'clip',
        label: 'New clip',
        run: newClip,
        busy: creatingClip,
        icon: clipIcon
      },
      data.settings?.showsEnabled && {
        key: 'show',
        label: 'New show',
        href: '/admin/shows?new=1',
        icon: showIcon
      },
      { key: 'media', label: 'Upload media', href: '/admin/media?upload=1', icon: mediaIcon }
    ].filter(Boolean) as NewAction[]
  );

  const tile = 'rounded-xl border border-gray-800 bg-gray-900 p-5';
  // inline-flex so the icon and the label sit on one baseline; the anchors and
  // the button share the class and would otherwise align differently.
  const stat =
    'flex items-baseline justify-between gap-3 py-2.5 transition-colors hover:text-white';
  const action =
    'inline-flex items-center gap-2 rounded-lg border border-gray-800 bg-gray-900 px-3 py-2 text-sm text-gray-300 transition-colors hover:border-gray-700 hover:text-white disabled:opacity-50';
</script>

{#snippet releaseIcon()}
  <Icon src={MusicalNote} size="16" />
{/snippet}
{#snippet clipIcon()}
  <Icon src={Film} size="16" />
{/snippet}
{#snippet showIcon()}
  <Icon src={CalendarDays} size="16" />
{/snippet}
{#snippet mediaIcon()}
  <Icon src={ArrowUpTray} size="16" />
{/snippet}

<div class="min-h-screen bg-gray-950 p-[clamp(1rem,4vw,1.5rem)]">
  {#if needsSetup}
    <SetupCard settings={data.settings} oncomplete={handleSetupComplete} />
  {:else}
    <div class="space-y-4">
      <!--
        Making a thing, not finding one — going somewhere is the sidebar's job,
        and repeating it here just puts the same link on screen twice. Each is
        offered only where the section it lands in exists.
      -->
      <!--
        One menu for making things and one for what's unfinished. Three buttons
        side by side wrapped onto two rows on a phone, and a fourth would have
        made three; a menu is one row at any width.
      -->
      <div class="flex flex-wrap items-center gap-2">
        <NewMenu actions={newActions} />

        <div class="ml-auto">
          <WaitingMenu items={waiting} />
        </div>
      </div>

      <AdminCalendar
        {locale}
        settings={data.settings}
        shows={data.shows ?? []}
        releases={data.releases ?? []}
        queue={data.queue ?? []}
        publishedClips={data.publishedClips ?? []}
        orders={data.orders ?? []}
      />

      <!--
        The numbers under the plan rather than over it. The chart carries the
        shape and the four figures stack beside it, so one row says what a row
        of tiles and a chart below it used to take two for.
      -->
      <div class={tile}>
        <!--
          The legend sits up here rather than on a line of its own under the
          plot. uPlot builds it straight into this element, and it stays the
          cursor readout — the figures change as you move across the chart.
        -->
        <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <span class="text-sm text-gray-400">Views, last 30 days</span>
          <div class="ml-auto flex items-center gap-4">
            <div bind:this={legendHost}></div>
            <!--
              A button rather than the small grey link this was. It used to be
              one of five "All …" links, each under a card that has since become
              the calendar or the waiting menu — and the last one of a pattern
              isn't a pattern, it's a loose thread. Borrowed from the actions at
              the top of the page, a size down.
            -->
            <a
              href="/admin/stats"
              class="rounded-lg border border-gray-800 px-2.5 py-1 text-xs whitespace-nowrap text-gray-400 transition-colors hover:border-gray-700 hover:text-white"
            >
              All stats
            </a>
          </div>
        </div>

        <div class="mt-3 grid gap-4 lg:grid-cols-[1fr_14rem]">
          <ViewsChart
            {locale}
            legendTarget={legendHost}
            viewsByDay={data.pageViews.viewsByDay}
            previousViewsByDay={data.previousPeriodViews}
          />

          <!--
            Rows, not cards. Four boxed tiles beside a chart made a column
            taller than the thing it was annotating; a label, a figure and the
            comparison on one line each say the same in a third of the height.
          -->
          <div class="divide-y divide-gray-800 border-t border-gray-800 lg:border-0">
            <a href="/admin/stats" class={stat}>
              <span class="text-xs text-gray-500">Views today</span>
              <span class="flex items-baseline gap-2">
                <span class="font-semibold text-white tabular-nums">{data.overview.todayViews}</span
                >
                <span class="text-xs text-gray-600">{data.overview.weekViews} this week</span>
              </span>
            </a>

            <a href="/admin/stats" class={stat}>
              <span class="text-xs text-gray-500">Clicks this week</span>
              <span class="flex items-baseline gap-2">
                <span class="font-semibold text-white tabular-nums">{data.overview.weekClicks}</span
                >
                <span class="text-xs text-gray-600">{data.overview.monthClicks} this month</span>
              </span>
            </a>

            {#if data.audience}
              <a href="/admin/subscribers" class={stat}>
                <span class="text-xs text-gray-500">Fan list</span>
                <span class="flex items-baseline gap-2">
                  <span class="font-semibold text-white tabular-nums">{data.audience.active}</span>
                  <span class="text-xs text-gray-600">+{data.audience.recent} in 30 days</span>
                </span>
              </a>
            {/if}

            <a href="/admin/stats" class={stat}>
              <span class="shrink-0 text-xs text-gray-500">Most clicked</span>
              <span class="ml-3 min-w-0 truncate text-sm font-semibold text-white">
                {data.overview.topLink?.label ?? data.overview.topLink?.platform ?? '—'}
              </span>
            </a>
          </div>
        </div>
      </div>
    </div>
  {/if}
</div>
