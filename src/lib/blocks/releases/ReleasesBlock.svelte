<script lang="ts">
  import BlockHeading from '../BlockHeading.svelte';
  import { getPlatformIcon, contrastSafeColor } from '$lib/utils/platforms';
  import type {
    Block,
    ReleasesBlockConfig,
    ReleaseSummary,
    PublicSettings
  } from '$lib/server/schema';

  /**
   * The records, on whatever page you put it.
   *
   * Draws the site's releases rather than owning a list of its own — the same
   * reason the shows block doesn't own a tour. A record announced once appears
   * everywhere it's displayed, and each tile leads to the release page that
   * already exists for it rather than out to one service.
   */
  let {
    block,
    releases = [],
    settings,
    locale = 'nb-NO'
  }: {
    block: Block;
    releases?: ReleaseSummary[];
    settings?: PublicSettings | null;
    locale?: string;
  } = $props();

  const config = $derived((block.config as ReleasesBlockConfig) ?? {});

  const now = Date.now();
  const isOut = (release: ReleaseSummary) => new Date(release.releaseDate).getTime() <= now;

  const shown = $derived.by(() => {
    /*
     * Upcoming reads forwards: what's next comes first, the way the shows block
     * lists a tour. Everything else reads backwards from the newest record,
     * which is the order a discography is read in.
     */
    const list =
      config.filter === 'upcoming'
        ? releases.filter((r) => !isOut(r)).reverse()
        : config.filter === 'out'
          ? releases.filter(isOut)
          : releases;
    return config.limit != null ? list.slice(0, config.limit) : list;
  });

  const rows = $derived(config.displayAs === 'rows');

  /*
   * One record doesn't make a grid. Left in a column a third of the page wide
   * it reads as the first of several that failed to load, so it centres and
   * takes the room a single sleeve deserves — which is most of what a block
   * showing one release is for.
   */
  const alone = $derived(!rows && shown.length === 1);

  /** Three unless the block says otherwise. Phones get two whatever it says. */
  const gridClass = $derived(
    {
      2: 'grid-cols-2',
      3: 'grid-cols-2 sm:grid-cols-3',
      4: 'grid-cols-2 sm:grid-cols-4'
    }[config.columns ?? 3]
  );

  function formatDate(date: Date | string): string {
    return new Intl.DateTimeFormat(locale, {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    }).format(new Date(date));
  }

  const dateLine = (release: ReleaseSummary) =>
    isOut(release) ? 'Out now' : `Out ${formatDate(release.releaseDate)}`;

  /**
   * Straight out to the pre-save, like the release page's own button: it's the
   * one thing to do with a record that isn't out, and a stop on the way is a
   * place to drop out. Nothing to offer once it's out, or without a link.
   */
  const presaveOf = (release: ReleaseSummary) =>
    config.showPresave !== false && !isOut(release) ? release.presaveUrl : null;

  /**
   * How many services fit beside a title before it has nothing left.
   *
   * Four on a wide screen; the fourth is dropped by a media query on a phone,
   * where 80px of sleeve and four 32px marks leave the name a hundred pixels.
   * The rest are on the release page, which is what the row leads to.
   */
  const MAX_SERVICES = 4;

  const servicesOf = (release: ReleaseSummary) =>
    config.showServices === false ? [] : release.links.slice(0, MAX_SERVICES);

  /** One pill, both layouts — a row puts it beside, a tile puts it under. */
  const presaveClass =
    'relative z-10 rounded-full text-xs font-bold tracking-wide uppercase' +
    ' transition-all hover:opacity-90 active:scale-95';
</script>

<!-- The sleeve, once. A row wants a thumbnail and a tile wants the artwork
     itself, but a missing cover has to fall back the same way in both. -->
{#snippet sleeve(release: ReleaseSummary, thumb: boolean)}
  <!-- Square, because cover art is. The border matters: a lot of sleeves are
       close to black, and without an edge one reads as a hole in the page
       rather than as a record. -->
  <div
    class="aspect-square overflow-hidden rounded-xl border border-white/10 bg-white/5 {thumb
      ? 'w-20 shrink-0'
      : ''}"
  >
    {#if release.coverUrl}
      <img
        src={release.coverUrl}
        alt="{release.title} cover art"
        loading="lazy"
        class="h-full w-full object-cover transition-transform duration-300 {thumb
          ? ''
          : 'group-hover:scale-105'}"
      />
    {:else}
      <div
        class="flex h-full w-full items-center justify-center"
        style="color: var(--color-text-muted); opacity: 0.4"
      >
        <svg
          class="h-1/3 w-1/3"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="1.5"
            d="M9 19V6l12-3v13M9 19a3 3 0 11-6 0 3 3 0 016 0zm12-3a3 3 0 11-6 0 3 3 0 016 0z"
          />
        </svg>
      </div>
    {/if}
  </div>
{/snippet}

<!--
  Hiding the type in the picker only stops new ones being added; a block already
  on a page would go on drawing a section the site no longer manages anywhere.
-->
{#if settings?.releasesEnabled && shown.length > 0}
  <section>
    <BlockHeading heading={config.heading} />

    {#if rows}
      <ul class="space-y-2">
        {#each shown as release (release.id)}
          {@const presave = presaveOf(release)}
          {@const services = servicesOf(release)}
          <!--
            The row isn't an anchor: a pre-save button inside one would be a
            link nested in a link. The title carries the link and stretches it
            over the row instead, so the whole thing is still clickable and the
            button beside it is its own target — the same arrangement as a show
            row with its tickets.
          -->
          <li
            class="group relative flex items-center gap-4 rounded-2xl bg-white/5 p-3 transition-colors hover:bg-white/10"
          >
            {@render sleeve(release, true)}

            <div class="min-w-0 flex-1">
              <a
                href="/{release.slug}"
                class="block truncate text-sm font-semibold after:absolute after:inset-0"
                style="color: var(--color-text)"
              >
                {release.title}
              </a>
              <p class="truncate text-xs" style="color: var(--color-text-muted)">
                {dateLine(release)}
              </p>
            </div>

            {#if presave}
              <a
                href={presave}
                rel="noopener"
                class="{presaveClass} shrink-0 px-3 py-1.5"
                style="background: var(--color-accent); color: var(--color-text)"
              >
                Pre-save
              </a>
            {/if}

            {#if services.length > 0}
              <!-- The services themselves, so hearing it is one press from the
                   front page. Through /go, like every other link on the site:
                   a play counted from here is the same play counted from the
                   release page. -->
              <div class="relative z-10 flex shrink-0 items-center gap-1.5">
                {#each services as link, i (link.id)}
                  {@const icon = getPlatformIcon(link.platform)}
                  {@const name = link.label ?? link.platform}
                  <a
                    href="/go/{link.id}"
                    rel="noopener"
                    aria-label="{isOut(release) ? 'Play' : 'Save'} on {name}"
                    title="{isOut(release) ? 'Play on' : 'Save on'} {name}"
                    class="h-8 w-8 items-center justify-center rounded-full bg-white/10 transition-all hover:bg-white/20 active:scale-95 {i >=
                    MAX_SERVICES - 1
                      ? 'hidden sm:flex'
                      : 'flex'}"
                  >
                    {#if icon}
                      <svg
                        viewBox="0 0 24 24"
                        class="h-4 w-4"
                        style="fill: {contrastSafeColor(
                          link.platform,
                          settings?.colorCard ?? '#14101f',
                          'var(--color-text)'
                        )}"
                        aria-hidden="true"
                      >
                        <path d={icon} />
                      </svg>
                    {:else}
                      <!-- Same fallback as LinkCard: a service we have no mark
                           for still gets a button the size of the others. -->
                      <span class="text-[10px] font-bold" style="color: var(--color-text)">
                        {name.charAt(0).toUpperCase()}
                      </span>
                    {/if}
                  </a>
                {/each}
              </div>
            {/if}
          </li>
        {/each}
      </ul>
    {:else}
      <ul class={alone ? 'mx-auto w-2/3 max-w-72 text-center' : `grid gap-3 ${gridClass}`}>
        {#each shown as release (release.id)}
          {@const presave = presaveOf(release)}
          <!-- Relative, and the tile's link stretches over it: the pre-save has
               to be its own target, and a link inside a link isn't one. -->
          <li class="group relative">
            <a href="/{release.slug}" class="block after:absolute after:inset-0">
              {@render sleeve(release, false)}

              <div class="mt-2 min-w-0">
                <p class="truncate text-sm font-semibold" style="color: var(--color-text)">
                  {release.title}
                </p>
                <p class="truncate text-xs" style="color: var(--color-text-muted)">
                  {dateLine(release)}
                </p>
              </div>
            </a>

            {#if presave}
              <a
                href={presave}
                rel="noopener"
                class="{presaveClass} mt-2 block px-3 py-1.5 text-center"
                style="background: var(--color-accent); color: var(--color-text)"
              >
                Pre-save
              </a>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  </section>
{/if}
