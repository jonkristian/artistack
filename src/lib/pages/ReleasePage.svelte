<script lang="ts">
  import SiteBackground from './SiteBackground.svelte';
  import { resolveTheme } from '$lib/themes';
  import { EmailCapture } from '$lib/components/ui';
  import { PlatformTile } from '$lib/components/cards';
  import type { Release, Link, PublicSettings, Profile } from '$lib/server/schema';

  interface Props {
    release: Release;
    releaseLinks: Link[];
    /** Image URL, so the admin can preview a pick that isn't saved yet. */
    cover: string | null;
    isOut: boolean;
    published: boolean;
    settings: PublicSettings | null;
    artist: string;
    /** The site's own artist — the theme's chrome is built around it. */
    profile: Profile;
    /** Whether the fan list is switched on for this site. */
    emailCapture?: boolean;
    /** True in the admin preview, where a sign-up would be a real one. */
    preview?: boolean;
    /** The page's slug, recorded against a sign-up. */
    source?: string | null;
    /** The service they last chose here, if any. */
    preferredPlatform?: string | null;
  }

  let {
    release,
    releaseLinks,
    cover,
    isOut,
    published,
    settings,
    artist,
    profile,
    emailCapture = false,
    preview = false,
    source = null,
    preferredPlatform = null
  }: Props = $props();

  /*
   * The service they used last time goes first. This is the whole of what makes
   * a smart link smart — a returning listener shouldn't have to find their
   * player in a list they've already chosen from once.
   *
   * A sort rather than a filter, and no redirect: everyone still sees every
   * option, in case they've changed player or are sending it to someone else.
   */
  /**
   * How many services show before the rest are folded away.
   *
   * A smart link exists to get someone to the player they already have. Past
   * a row it stops being a shortcut and becomes something to read, and the
   * ones below are regional services most visitors will never use.
   */
  const VISIBLE_LINKS = 5;

  let showAll = $state(false);

  const orderedLinks = $derived(
    preferredPlatform
      ? [...releaseLinks].sort(
          (a, b) =>
            Number(b.platform === preferredPlatform) - Number(a.platform === preferredPlatform)
        )
      : releaseLinks
  );

  // Locale comes from settings so the date reads the way the rest of the site
  // does; nb-NO renders "18. september 2026" rather than the US ordering.
  const Layout = $derived(resolveTheme(settings?.layout));

  function formatDate(date: Date): string {
    return new Intl.DateTimeFormat(settings?.locale ?? 'nb-NO', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    }).format(date);
  }
</script>

<!--
  The front page's scaffolding with a release inside it. The colours used to be
  redeclared here, which meant this page had its own copy of the palette and
  its own layout — so a change in Appearance reached the site but not the thing
  you were sending people to.
-->
<SiteBackground {settings}>
  <Layout {profile} {settings} links={[]} shows={[]} blocks={[]} media={[]}>
    <main class="mx-auto flex w-full max-w-md flex-col items-center gap-6">
      {#if cover}
        <img
          src={cover}
          alt="{release.title} cover art"
          width="640"
          height="640"
          class="w-full rounded-xl shadow-2xl shadow-black/60"
        />
      {/if}

      <header class="flex flex-col items-center gap-1 text-center">
        {#if artist}
          <p class="text-sm tracking-[0.18em] uppercase" style="color: var(--color-text-muted)">
            {artist}
          </p>
        {/if}
        <h1 class="text-3xl font-semibold text-balance">{release.title}</h1>
        <p class="text-sm" style="color: var(--color-text-muted)">
          {isOut ? 'Out now' : `Out ${formatDate(release.releaseDate)}`}
        </p>
      </header>

      {#if !isOut && release.presaveUrl}
        <a
          href={release.presaveUrl}
          class="w-full rounded-lg px-5 py-3.5 text-center font-semibold transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2"
          style="background-color: var(--color-accent); color: var(--color-bg); outline-color: var(--color-accent)"
        >
          Pre-save
        </a>
      {/if}

      {#if orderedLinks.length > 0}
        <!-- A row of the services' marks, like apps on a home screen: the tile is
             the button, so there's no card around it to make each one a slab.
             Wrapped rather than a grid, so a short last row sits centred. -->
        <ul class="flex w-full flex-wrap justify-center gap-x-3 gap-y-4">
          {#each showAll ? orderedLinks : orderedLinks.slice(0, VISIBLE_LINKS) as link (link.id)}
            {@const preferred = link.platform === preferredPlatform}
            <li class="w-[4.5rem]">
              <!-- Through /go so the click is tracked and any campaign params
                 on the incoming URL carry through to the destination. -->
              <a
                href="/go/{link.id}"
                rel="noopener"
                class="group flex flex-col items-center gap-1.5 rounded-xl text-center focus-visible:outline-2 focus-visible:outline-offset-4"
                style="outline-color: var(--color-accent)"
              >
                <span
                  class="rounded-xl transition group-hover:-translate-y-0.5 group-hover:brightness-125 group-active:scale-95 {preferred
                    ? 'ring-2 ring-offset-2'
                    : ''}"
                  style="--tw-ring-color: var(--color-accent); --tw-ring-offset-color: var(--color-bg)"
                >
                  <PlatformTile platform={link.platform} />
                </span>
                <!-- Two lines rather than an ellipsis: "YouTube Music" is the name, and
                     "YouTube …" is a different service. -->
                <span
                  class="line-clamp-2 w-full text-xs leading-tight font-medium"
                  style="color: var(--color-text)"
                >
                  {link.label ?? link.platform}
                </span>
              </a>
            </li>
          {/each}
        </ul>

        {#if !showAll && orderedLinks.length > VISIBLE_LINKS}
          <button
            type="button"
            onclick={() => (showAll = true)}
            class="text-sm underline underline-offset-4 transition hover:brightness-125"
            style="color: var(--color-text-muted)"
          >
            {orderedLinks.length - VISIBLE_LINKS} more
          </button>
        {/if}
      {/if}

      <!-- After the buttons, like the sign-up below it: someone who came to
           listen should reach what they came for before being asked to read
           anything. -->
      {#if release.body}
        <section
          class="release-copy w-full text-sm leading-relaxed"
          style="color: var(--color-text-muted)"
        >
          {@html release.body}
        </section>
      {/if}

      {#if emailCapture}
        <!-- After the platform buttons on purpose: someone who came to listen
           should reach what they came for before being asked for anything. -->
        <EmailCapture {source} disabled={preview} />
      {/if}

      {#if !published}
        <p
          class="rounded-md border border-dashed px-3 py-2 text-center text-xs"
          style="border-color: var(--color-accent); color: var(--color-text-muted)"
        >
          Draft — only visible to you until this page is published.
        </p>
      {/if}
    </main>
  </Layout>
</SiteBackground>

<style>
  /* Paragraphs, spaced the way the bio block spaces its own. */
  .release-copy :global(p + p) {
    margin-top: 0.75rem;
  }
</style>
