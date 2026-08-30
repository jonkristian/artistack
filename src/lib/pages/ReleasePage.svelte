<script lang="ts">
  import { getPlatformIcon, getPlatformColor, contrastSafeColor } from '$lib/utils/platforms';
  import { EmailCapture } from '$lib/components/ui';
  import type { Release, Link, PublicSettings } from '$lib/server/schema';

  interface Props {
    release: Release;
    releaseLinks: Link[];
    /** Image URL, so the admin can preview a pick that isn't saved yet. */
    cover: string | null;
    isOut: boolean;
    published: boolean;
    settings: PublicSettings | null;
    artist: string;
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
   * about five the list stops being a shortcut and becomes something to read,
   * and the ones below are regional services most visitors will never use.
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
  function formatDate(date: Date): string {
    return new Intl.DateTimeFormat(settings?.locale ?? 'nb-NO', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    }).format(date);
  }
</script>

<div
  class="min-h-screen px-4 py-12"
  style="
    --color-bg: {settings?.colorBg ?? '#0c0a14'};
    --color-card: {settings?.colorCard ?? '#14101f'};
    --color-accent: {settings?.colorAccent ?? '#8b5cf6'};
    --color-text: {settings?.colorText ?? '#f4f4f5'};
    --color-text-muted: {settings?.colorTextMuted ?? '#a1a1aa'};
    background-color: var(--color-bg);
    color: var(--color-text);
  "
>
  <main class="mx-auto flex w-full max-w-md flex-col items-center gap-6">
    {#if cover}
      <!-- The border matters: this artwork is close to black, and without an
           edge it reads as a hole in the page rather than as a record sleeve. -->
      <img
        src={cover}
        alt="{release.title} cover art"
        width="640"
        height="640"
        class="w-full max-w-xs rounded-lg border border-white/10 shadow-2xl shadow-black/60"
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
      <ul class="flex w-full flex-col gap-2.5">
        {#each showAll ? orderedLinks : orderedLinks.slice(0, VISIBLE_LINKS) as link (link.id)}
          {@const icon = getPlatformIcon(link.platform)}
          <li>
            <!-- Through /go so the click is tracked and any campaign params
                 on the incoming URL carry through to the destination. -->
            <a
              href="/go/{link.id}"
              rel="noopener"
              class="flex items-center gap-3 rounded-lg border border-white/10 px-4 py-3 transition hover:border-white/25 focus-visible:outline-2 focus-visible:outline-offset-2"
              style="background-color: var(--color-card); outline-color: var(--color-accent)"
            >
              {#if icon}
                <svg
                  viewBox="0 0 24 24"
                  class="h-5 w-5 shrink-0"
                  fill={contrastSafeColor(link.platform, settings?.colorBg ?? '#0c0a14')}
                  aria-hidden="true"
                >
                  <path d={icon} />
                </svg>
              {:else}
                <!-- Same fallback as LinkCard: a service we have no mark for
                     still gets a row that lines up with the others. -->
                <div
                  class="flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px] font-bold text-white"
                  style="background-color: {contrastSafeColor(
                    link.platform,
                    settings?.colorBg ?? '#0c0a14',
                    'var(--color-accent)'
                  )}"
                  aria-hidden="true"
                >
                  {link.platform.charAt(0).toUpperCase()}
                </div>
              {/if}
              <span class="font-medium">{link.label ?? link.platform}</span>
              {#if link.platform === preferredPlatform}
                <span
                  class="rounded-full border px-2 py-0.5 text-[10px] tracking-wide uppercase"
                  style="border-color: color-mix(in srgb, var(--color-accent) 45%, transparent); color: var(--color-text-muted)"
                >
                  Last used
                </span>
              {/if}
              <span class="ml-auto text-sm" style="color: var(--color-text-muted)">
                {isOut ? 'Play' : 'Save'}
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
</div>
