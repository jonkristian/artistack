<script lang="ts">
  import type {
    Block,
    Profile,
    Link,
    TourDate,
    Media,
    TourDatesBlockConfig
  } from '$lib/server/schema';
  import { addToCalendar } from '$lib/blocks/utils';
  import { getPlatformInfoFromUrl } from '$lib/utils/platforms';

  let {
    block,
    profile,
    links,
    tourDates,
    media,
    locale
  }: {
    block: Block;
    profile: Profile;
    links: Link[];
    tourDates: TourDate[];
    media: Media[];
    locale: string;
  } = $props();

  const config = $derived((block.config as TourDatesBlockConfig) ?? {});

  // Only show tour dates that belong to this block
  const blockTourDates = $derived(tourDates.filter((t) => t.blockId === block.id));

  const today = new Date().toISOString().split('T')[0];
  const upcomingShows = $derived(blockTourDates.filter((t) => t.date >= today));
  const pastShows = $derived(blockTourDates.filter((t) => t.date < today).reverse());
  let showPastShows = $state(false);

  const showPast = $derived(config.showPastShows !== false);
</script>

{#if upcomingShows.length > 0 || (showPast && pastShows.length > 0)}
  <section class="mb-5">
    {#if config.heading}
      <h2
        class="mb-3 text-[10px] font-semibold tracking-widest uppercase"
        style="color: var(--color-accent)"
      >
        {config.heading}
      </h2>
    {:else if upcomingShows.length > 0}
      <h2
        class="mb-3 text-[10px] font-semibold tracking-widest uppercase"
        style="color: var(--color-accent)"
      >
        Upcoming Shows
      </h2>
    {/if}
    <div class="space-y-2">
      {#each upcomingShows as tour (tour.id)}
        {@const eventInfo = tour.eventUrl ? getPlatformInfoFromUrl(tour.eventUrl) : null}
        {@const mapsUrl = tour.venue.placeId
          ? `https://www.google.com/maps/place/?q=place_id:${tour.venue.placeId}`
          : tour.venue.lat && tour.venue.lng
            ? `https://www.google.com/maps?q=${tour.venue.lat},${tour.venue.lng}`
            : tour.venue.address
              ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(tour.venue.address)}`
              : null}
        <div
          class="group flex gap-5 rounded-2xl bg-white/5 p-4 transition-all {tour.soldOut
            ? 'opacity-60'
            : 'hover:bg-white/10'}"
        >
          <!-- Date column -->
          <div class="w-fit flex-shrink-0 self-center text-center">
            <p class="text-2xl leading-none font-bold" style="color: var(--color-accent)">
              {new Date(tour.date).getDate()}
            </p>
            <p
              class="mt-1 text-xs font-semibold tracking-wider uppercase"
              style="color: var(--color-text-muted)"
            >
              {new Date(tour.date).toLocaleDateString(locale, { month: 'short' })}
            </p>
            {#if tour.time}
              <p class="mt-1 text-[10px] font-medium" style="color: var(--color-text-muted)">
                {tour.time}
              </p>
            {/if}
          </div>

          <!-- Content column -->
          <div class="min-w-0 flex-1">
            {#if tour.title}
              <p class="truncate font-semibold" style="color: var(--color-text)">{tour.title}</p>
            {/if}
            <p class="truncate text-sm" style="color: var(--color-text-muted)">
              {#if mapsUrl}
                <a
                  href={mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  class="inline-flex items-center gap-1 hover:underline"
                  title="Open in Google Maps"
                >
                  {tour.venue.name} · {tour.venue.city}
                  <svg
                    class="h-3 w-3 flex-shrink-0 opacity-60"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                    />
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                  </svg>
                </a>
              {:else}
                {tour.venue.name} · {tour.venue.city}
              {/if}
            </p>
            {#if tour.lineup}
              <p
                class="mt-0.5 truncate text-xs"
                style="color: var(--color-text-muted); opacity: 0.75"
              >
                {tour.lineup}
              </p>
            {/if}
          </div>

          <!-- Actions -->
          <div class="flex flex-shrink-0 items-center gap-2">
            {#if tour.soldOut}
              <span
                class="rounded-full bg-red-500/20 px-3 py-1 text-xs font-bold tracking-wide text-red-400 uppercase"
              >
                Sold Out
              </span>
            {:else if tour.ticketUrl}
              <a
                href={tour.ticketUrl}
                target="_blank"
                rel="noopener noreferrer"
                class="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full transition-all hover:opacity-90 active:scale-95 sm:h-auto sm:w-auto sm:gap-1.5 sm:px-3 sm:py-1.5"
                style="background: var(--color-accent); color: var(--color-text)"
                title="Buy tickets"
              >
                <svg
                  class="h-4 w-4 sm:h-3.5 sm:w-3.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z"
                  />
                </svg>
                <span class="hidden text-xs font-bold tracking-wide uppercase sm:inline"
                  >Tickets</span
                >
              </a>
            {/if}

            {#if !tour.soldOut}
              <button
                onclick={() => addToCalendar(tour, profile.name)}
                class="hidden h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-white/10 transition-all hover:bg-white/20 active:scale-95 sm:flex"
                style="color: var(--color-text-muted)"
                title="Add to calendar"
              >
                <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
              </button>
            {/if}

            {#if tour.eventUrl}
              <a
                href={tour.eventUrl}
                target="_blank"
                rel="noopener noreferrer"
                class="hidden h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-white/10 transition-all hover:bg-white/20 active:scale-95 sm:flex"
                style="color: var(--color-text)"
                title="View on {eventInfo?.platform || 'event page'}"
              >
                {#if eventInfo?.icon}
                  <svg viewBox="0 0 24 24" class="h-4 w-4" style="fill: currentColor">
                    <path d={eventInfo.icon} />
                  </svg>
                {:else}
                  <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                    />
                  </svg>
                {/if}
              </a>
            {/if}

            <!-- Mobile menu -->
            {#if !tour.soldOut || tour.eventUrl}
              <div class="relative sm:hidden">
                <button
                  onclick={(e) => {
                    const menu = e.currentTarget.nextElementSibling;
                    const isHidden = menu?.classList.contains('hidden');
                    document
                      .querySelectorAll('[data-tour-menu]')
                      .forEach((m) => m.classList.add('hidden'));
                    if (isHidden) {
                      menu?.classList.remove('hidden');
                      const closeMenu = (evt: Event) => {
                        if (!e.currentTarget?.closest('.relative')?.contains(evt.target as Node)) {
                          menu?.classList.add('hidden');
                          document.removeEventListener('click', closeMenu);
                        }
                      };
                      setTimeout(() => document.addEventListener('click', closeMenu), 0);
                    }
                  }}
                  class="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-white/10 transition-all hover:bg-white/20 active:scale-95"
                  style="color: var(--color-text-muted)"
                  title="More options"
                >
                  <svg class="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                    <circle cx="12" cy="5" r="2" />
                    <circle cx="12" cy="12" r="2" />
                    <circle cx="12" cy="19" r="2" />
                  </svg>
                </button>
                <div
                  data-tour-menu
                  class="absolute top-full right-0 z-10 mt-1 hidden min-w-[160px] rounded-xl p-1 shadow-xl"
                  style="background: var(--color-card); border: 1px solid rgba(255,255,255,0.1)"
                >
                  {#if !tour.soldOut}
                    <button
                      onclick={(e) => {
                        addToCalendar(tour, profile.name);
                        e.currentTarget.closest('[data-tour-menu]')?.classList.add('hidden');
                      }}
                      class="flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-left text-sm whitespace-nowrap transition-colors hover:bg-white/10"
                      style="color: var(--color-text)"
                    >
                      <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="2"
                          d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                        />
                      </svg>
                      Add to calendar
                    </button>
                  {/if}
                  {#if tour.eventUrl}
                    <a
                      href={tour.eventUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      class="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm whitespace-nowrap transition-colors hover:bg-white/10"
                      style="color: var(--color-text)"
                    >
                      {#if eventInfo?.icon}
                        <svg viewBox="0 0 24 24" class="h-4 w-4" style="fill: currentColor">
                          <path d={eventInfo.icon} />
                        </svg>
                      {:else}
                        <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                          />
                        </svg>
                      {/if}
                      View on {eventInfo?.platform || 'event page'}
                    </a>
                  {/if}
                </div>
              </div>
            {/if}
          </div>
        </div>
      {/each}
    </div>

    <!-- Past Shows (collapsible) -->
    {#if showPast && pastShows.length > 0}
      <button
        onclick={() => (showPastShows = !showPastShows)}
        class="mt-6 mb-3 flex cursor-pointer items-center gap-2 text-[10px] font-semibold tracking-widest uppercase transition-opacity hover:opacity-80"
        style="color: var(--color-text-muted)"
      >
        <span>Past Shows</span>
        <svg
          class="h-3 w-3 transition-transform {showPastShows ? 'rotate-180' : ''}"
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

      {#if showPastShows}
        <div class="mt-3 space-y-2">
          {#each pastShows as tour (tour.id)}
            {@const eventInfo = tour.eventUrl ? getPlatformInfoFromUrl(tour.eventUrl) : null}
            {@const mapsUrl = tour.venue.placeId
              ? `https://www.google.com/maps/place/?q=place_id:${tour.venue.placeId}`
              : tour.venue.lat && tour.venue.lng
                ? `https://www.google.com/maps?q=${tour.venue.lat},${tour.venue.lng}`
                : tour.venue.address
                  ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(tour.venue.address)}`
                  : null}
            <div class="group flex gap-5 rounded-2xl bg-white/5 p-4 opacity-60">
              <div class="w-fit flex-shrink-0 self-center text-center">
                <p class="text-2xl leading-none font-bold" style="color: var(--color-text-muted)">
                  {new Date(tour.date).getDate()}
                </p>
                <p
                  class="mt-1 text-xs font-semibold tracking-wider uppercase"
                  style="color: var(--color-text-muted)"
                >
                  {new Date(tour.date).toLocaleDateString(locale, { month: 'short' })}
                </p>
              </div>

              <div class="min-w-0 flex-1">
                {#if tour.title}
                  <p class="truncate font-semibold" style="color: var(--color-text)">
                    {tour.title}
                  </p>
                {/if}
                <p class="truncate text-sm" style="color: var(--color-text-muted)">
                  {#if mapsUrl}
                    <a
                      href={mapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      class="hover:underline"
                    >
                      {tour.venue.name} · {tour.venue.city}
                    </a>
                  {:else}
                    {tour.venue.name} · {tour.venue.city}
                  {/if}
                </p>
              </div>

              {#if tour.eventUrl}
                <div class="flex flex-shrink-0 items-center">
                  <a
                    href={tour.eventUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-white/10 transition-all hover:bg-white/20"
                    style="color: var(--color-text-muted)"
                    title="View on {eventInfo?.platform || 'event page'}"
                  >
                    {#if eventInfo?.icon}
                      <svg viewBox="0 0 24 24" class="h-4 w-4" style="fill: currentColor">
                        <path d={eventInfo.icon} />
                      </svg>
                    {:else}
                      <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="2"
                          d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                        />
                      </svg>
                    {/if}
                  </a>
                </div>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    {/if}
  </section>
{/if}
