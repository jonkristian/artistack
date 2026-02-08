<script lang="ts">
  import type {
    Block,
    Profile,
    Settings,
    Link,
    TourDate,
    Media,
    LinksBlockConfig
  } from '$lib/server/schema';
  import type { RepoEmbedData } from '$lib/server/schema';
  import { BandcampEmbed, SpotifyEmbed, YouTubeEmbed } from '$lib/components/embeds';
  import { RepoCard } from '$lib/components/cards';
  import { trackClick } from '$lib/blocks/utils';
  import { platformIcons } from '$lib/utils/platforms';

  let {
    block,
    profile,
    settings = null,
    links,
    tourDates,
    media,
    locale
  }: {
    block: Block;
    profile: Profile;
    settings?: Settings | null;
    links: Link[];
    tourDates: TourDate[];
    media: Media[];
    locale: string;
  } = $props();

  const config = $derived((block.config as LinksBlockConfig) ?? {});
  const displayAs = $derived(config.displayAs ?? 'rows');
  const gridColumns = $derived(config.gridColumns ?? 3);
  const isGrid = $derived(displayAs === 'grid');
  const stackOnMobile = $derived(config.stackOnMobile !== false);

  // Only show links that belong to this block
  const blockLinks = $derived(links.filter((l) => l.blockId === block.id));
</script>

{#if blockLinks.length > 0}
  <section class="mb-8">
    {#if config.heading}
      <h2
        class="mb-3 text-[10px] font-semibold tracking-widest uppercase"
        style="color: var(--color-accent)"
      >
        {config.heading}
      </h2>
    {/if}
    <div
      class="{isGrid ? 'grid gap-3' : 'space-y-3'}{isGrid && stackOnMobile ? ' links-grid-stack' : ''}"
      style={isGrid ? `grid-template-columns: repeat(${gridColumns}, minmax(0, 1fr))` : undefined}
    >
      {#each blockLinks as link (link.id)}
        {#if link.embedData?.platform === 'bandcamp' && link.embedData?.id && link.embedData?.enabled !== false}
          <div style={isGrid ? 'grid-column: 1 / -1' : undefined}>
            <BandcampEmbed
              embedId={link.embedData.id}
              embedType={link.embedData.type || 'album'}
              title={link.label || 'Bandcamp'}
              bgColor={link.embedData.bgColor || settings?.colorCard || '333333'}
              linkColor={link.embedData.linkColor || settings?.colorAccent || '8b5cf6'}
              size={link.embedData.size || 'large'}
              tracklist={link.embedData.tracklist !== false}
              artwork={link.embedData.artwork || 'small'}
            />
          </div>
        {:else if link.embedData?.platform === 'spotify' && link.embedData?.id && link.embedData?.enabled !== false}
          <div style={isGrid ? 'grid-column: 1 / -1' : undefined}>
            <SpotifyEmbed
              embedId={link.embedData.id}
              embedType={link.embedData.type || 'track'}
              theme={link.embedData.theme || 'dark'}
              compact={link.embedData.compact || false}
            />
          </div>
        {:else if link.embedData?.platform === 'youtube' && link.embedData?.id && link.embedData?.enabled !== false}
          <div style={isGrid ? 'grid-column: 1 / -1' : undefined}>
            <YouTubeEmbed videoId={link.embedData.id} />
          </div>
        {:else if ['github', 'gitlab', 'codeberg'].includes(link.embedData?.platform ?? '') && link.embedData?.id && link.embedData?.enabled !== false}
          <RepoCard
            linkId={link.id}
            label={link.label}
            url={link.url}
            embedData={link.embedData as RepoEmbedData}
          />
        {:else if isGrid}
          <a
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            onclick={() => trackClick(link.id)}
            class="group flex flex-col items-center gap-2 overflow-hidden rounded-xl bg-white/5 p-4 text-center transition-all hover:bg-white/10 active:scale-[0.98]"
          >
            {#if link.thumbnailUrl}
              <img
                src={link.thumbnailUrl}
                alt={link.label || link.platform}
                loading="lazy"
                class="h-12 w-12 flex-shrink-0 rounded-xl object-cover shadow-lg"
              />
            {:else if platformIcons[link.platform]}
              <div
                class="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl"
                style="background: linear-gradient(135deg, var(--color-icon, #a1a1aa)40, var(--color-icon, #a1a1aa)20)"
              >
                <svg
                  viewBox="0 0 24 24"
                  class="h-6 w-6"
                  style="fill: var(--color-icon)"
                >
                  <path d={platformIcons[link.platform]} />
                </svg>
              </div>
            {:else}
              <div
                class="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl font-bold"
                style="background: linear-gradient(135deg, var(--color-icon, #a1a1aa)40, var(--color-icon, #a1a1aa)20); color: var(--color-icon)"
              >
                {link.platform.charAt(0).toUpperCase()}
              </div>
            {/if}
            <span
              class="w-full truncate text-sm font-semibold capitalize"
              style="color: var(--color-text)"
            >
              {link.label || link.platform.replace('_', ' ')}
            </span>
          </a>
        {:else}
          <a
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            onclick={() => trackClick(link.id)}
            class="group relative flex items-center gap-3 overflow-hidden rounded-xl bg-white/5 p-2 transition-all hover:bg-white/10 active:scale-[0.98]"
          >
            {#if link.thumbnailUrl}
              <img
                src={link.thumbnailUrl}
                alt={link.label || link.platform}
                loading="lazy"
                class="h-16 w-16 flex-shrink-0 rounded-xl object-cover shadow-lg"
              />
              <div class="min-w-0 flex-1">
                <p class="truncate font-semibold" style="color: var(--color-text)">
                  {link.label || link.platform.replace('_', ' ')}
                </p>
                <p
                  class="mt-0.5 flex items-center gap-1.5 text-sm"
                  style="color: var(--color-text-muted)"
                >
                  {#if platformIcons[link.platform]}
                    <svg
                      viewBox="0 0 24 24"
                      class="h-4 w-4"
                      style="fill: var(--color-icon)"
                    >
                      <path d={platformIcons[link.platform]} />
                    </svg>
                  {/if}
                  <span class="capitalize">{link.platform.replace('_', ' ')}</span>
                </p>
              </div>
            {:else}
              {#if platformIcons[link.platform]}
                <div
                  class="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl"
                  style="background: linear-gradient(135deg, {platformColors[link.platform] ||
                    'var(--color-accent)'}40, {platformColors[link.platform] ||
                    'var(--color-accent)'}20)"
                >
                  <svg
                    viewBox="0 0 24 24"
                    class="h-6 w-6"
                    style="fill: var(--color-icon)"
                  >
                    <path d={platformIcons[link.platform]} />
                  </svg>
                </div>
              {:else}
                <div
                  class="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl font-bold"
                  style="background: linear-gradient(135deg, var(--color-icon, #a1a1aa)40, var(--color-icon, #a1a1aa)20); color: var(--color-icon)"
                >
                  {link.platform.charAt(0).toUpperCase()}
                </div>
              {/if}
              <span class="flex-1 font-semibold capitalize" style="color: var(--color-text)">
                {link.label || link.platform.replace('_', ' ')}
              </span>
            {/if}
            <svg
              class="h-5 w-5 flex-shrink-0 transition-all group-hover:translate-x-1"
              style="color: var(--color-text-muted); opacity: 0.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M9 5l7 7-7 7"
              />
            </svg>
          </a>
        {/if}
      {/each}
    </div>
  </section>
{/if}

<style>
  @media (max-width: 639px) {
    .links-grid-stack {
      grid-template-columns: 1fr !important;
    }
  }
</style>
