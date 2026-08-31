<script lang="ts">
  import SiteBackground from './SiteBackground.svelte';
  import { resolveTheme } from '$lib/themes';
  import { shapeClasses, addToCalendar } from '$lib/blocks/utils';
  import { getPlatformInfoFromUrl } from '$lib/utils/platforms';
  import type { PublicSettings } from '$lib/server/settings';
  import type { Show, Profile, Media } from '$lib/server/schema';

  /**
   * One gig at its own address.
   *
   * The poster leads, because that's what a gig is advertised with — the same
   * role cover art plays on a release page. Everything below it speaks the
   * shows block's vocabulary: the date in the accent colour, the venue as a map
   * link, and the same three things you can do about it. A page that invented
   * its own would be a second design for one idea.
   */
  let {
    show,
    lineup,
    settings,
    profile,
    media = [],
    imageShape = null,
    locale = 'nb-NO'
  }: {
    show: Show;
    lineup: { name: string; logoUrl: string | null; isSelf: boolean; setTime: string | null }[];
    settings: PublicSettings | null;
    /** The site's own artist — the theme's chrome is built around it. */
    profile: Profile;
    media?: Media[];
    /** The frame the poster was cropped in, so its corners match the choice. */
    imageShape?: string | null;
    locale?: string;
  } = $props();

  /*
   * The front page's scaffolding with a gig inside it, rather than a second
   * layout to keep in step. Which one it is follows the Appearance setting, so
   * changing the site's look reaches this page too.
   */
  const Layout = $derived(resolveTheme(settings?.layout));

  const date = $derived(new Date(show.date));
  const weekday = $derived(new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(date));
  const month = $derived(new Intl.DateTimeFormat(locale, { month: 'short' }).format(date));

  const isPast = $derived(show.date < new Date().toISOString().split('T')[0]);

  /** When the first act is on, which is the show starting. */
  const firstSetTime = $derived(
    lineup
      .map((a) => a.setTime)
      .filter((t): t is string => !!t)
      .sort()[0] ?? null
  );

  const posterShape = $derived(
    imageShape ? (shapeClasses[imageShape] ?? 'rounded-2xl') : 'rounded-2xl'
  );

  const eventInfo = $derived(show.eventUrl ? getPlatformInfoFromUrl(show.eventUrl) : null);

  const mapsUrl = $derived(
    show.venue.placeId
      ? `https://www.google.com/maps/place/?q=place_id:${show.venue.placeId}`
      : show.venue.lat && show.venue.lng
        ? `https://www.google.com/maps?q=${show.venue.lat},${show.venue.lng}`
        : show.venue.address
          ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(show.venue.address)}`
          : null
  );
</script>

<SiteBackground {settings}>
  <Layout {profile} {settings} links={[]} shows={[]} blocks={[]} {media}>
    <div class="flex flex-col gap-8">
      {#if show.imageUrl}
        <!--
        Natural aspect, no fixed ratio: portrait and landscape posters are both
        normal, and the hero is the one place with room to show either whole.
        Corners follow the frame it was cropped in.
      -->
        <img src={show.imageUrl} alt="" class="w-full {posterShape} {isPast ? 'opacity-60' : ''}" />
      {/if}

      <header class="flex gap-5">
        <!-- The date column from the shows block, so a gig looks like a gig
           wherever you meet it. -->
        <div class="w-fit flex-shrink-0 text-center">
          <p class="text-4xl leading-none font-bold" style="color: var(--color-accent)">
            {date.getDate()}
          </p>
          <p
            class="mt-1 text-xs font-semibold tracking-wider uppercase"
            style="color: var(--color-text-muted)"
          >
            {month}
          </p>
          <p class="mt-0.5 text-[10px]" style="color: var(--color-text-muted); opacity: 0.7">
            {date.getFullYear()}
          </p>
        </div>

        <div class="min-w-0 flex-1">
          <!-- No artist name here: it's their site, the theme's chrome already
               says so, and dropping it lets the title start level with the
               date beside it. -->
          <h1 class="text-2xl leading-tight font-bold" style="color: var(--color-text)">
            {show.title || show.venue.name}
          </h1>

          <!--
            Doors only when there is one — calling the show's start "doors" sent
            people half an hour late. When it starts comes from the line-up: the
            first act's time is the show beginning, so nothing has to be kept in
            step with it by hand.
          -->
          <p class="mt-2 text-sm" style="color: var(--color-text-muted)">
            <!-- `{' · '}` rather than a literal: Svelte trims the whitespace at
                 the start of a block, so a separator written on its own line
                 ends up flush against the word before it. -->
            {weekday}{#if show.doorsTime}{' · '}doors {show.doorsTime}{/if}{#if firstSetTime}{' · '}music
              {firstSetTime}{/if}
          </p>

          <p class="mt-0.5 text-sm" style="color: var(--color-text-muted)">
            {#if mapsUrl}
              <a
                href={mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                class="inline-flex items-center gap-1 hover:underline"
                title="Open in Google Maps"
              >
                {show.venue.name} · {show.venue.city}
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
              {show.venue.name} · {show.venue.city}
            {/if}
          </p>
        </div>
      </header>

      {#if lineup.length > 0}
        <section>
          <h2 class="mb-1 text-xs tracking-wider uppercase" style="color: var(--color-text-muted)">
            Line-up
          </h2>
          <ul class="flex flex-col">
            {#each lineup as act (act.name)}
              <li
                class="flex items-center gap-3 border-t py-3 first:border-t-0"
                style="border-color: color-mix(in srgb, var(--color-text-muted) 20%, transparent)"
              >
                {#if act.logoUrl}
                  <img
                    src={act.logoUrl}
                    alt={act.name}
                    class="h-8 w-8 flex-shrink-0 object-contain"
                    loading="lazy"
                  />
                {/if}
                <span
                  class="min-w-0 flex-1 truncate"
                  style="color: var(--color-text); opacity: {act.isSelf ? 1 : 0.8}"
                >
                  {act.name}
                </span>
                {#if act.setTime}
                  <span class="flex-shrink-0 text-sm" style="color: var(--color-text-muted)">
                    {act.setTime}
                  </span>
                {/if}
              </li>
            {/each}
          </ul>
        </section>
      {/if}

      <!--
      The same three actions the shows block offers, at the size a page can give
      them. A gig that's been keeps its event link but loses the ticket button
      and the calendar entry, both of which would be dead ends.
    -->
      <div class="flex flex-wrap items-center gap-3">
        {#if show.soldOut}
          <span
            class="rounded-full bg-red-500/20 px-4 py-2 text-sm font-bold tracking-wide text-red-400 uppercase"
          >
            Sold out
          </span>
        {:else if !isPast && show.ticketUrl}
          <a
            href={show.ticketUrl}
            target="_blank"
            rel="noopener noreferrer"
            class="flex flex-1 items-center justify-center gap-2 rounded-xl px-5 py-3 font-bold tracking-wide uppercase transition-opacity hover:opacity-90"
            style="background: var(--color-accent); color: var(--color-text)"
          >
            <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z"
              />
            </svg>
            Tickets
          </a>
        {/if}

        {#if !isPast}
          <button
            onclick={() =>
              addToCalendar(
                show,
                profile.name,
                lineup.map((a) => a.name)
              )}
            class="flex h-12 w-12 items-center justify-center rounded-xl bg-white/10 transition-colors hover:bg-white/20"
            style="color: var(--color-text-muted)"
            title="Add to calendar"
            aria-label="Add to calendar"
          >
            <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
          </button>
        {/if}

        {#if show.eventUrl}
          <a
            href={show.eventUrl}
            target="_blank"
            rel="noopener noreferrer"
            class="flex h-12 w-12 items-center justify-center rounded-xl bg-white/10 transition-colors hover:bg-white/20"
            style="color: var(--color-text)"
            title="View on {eventInfo?.platform || 'event page'}"
            aria-label="View on {eventInfo?.platform || 'event page'}"
          >
            {#if eventInfo?.icon}
              <svg viewBox="0 0 24 24" class="h-5 w-5" style="fill: currentColor">
                <path d={eventInfo.icon} />
              </svg>
            {:else}
              <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="1.5"
                  d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                />
              </svg>
            {/if}
          </a>
        {/if}
      </div>
    </div>
  </Layout>
</SiteBackground>
