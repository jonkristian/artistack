<script lang="ts">
  import type {
    Block,
    Profile,
    Link,
    TourDate,
    Media,
    GalleryBlockConfig
  } from '$lib/server/schema';

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

  const config = $derived((block.config as GalleryBlockConfig) ?? {});
  const displayAs = $derived(config.displayAs ?? 'grid');

  // Get media items referenced by this block's config
  const blockMedia = $derived(
    config.mediaIds
      ? config.mediaIds
          .map((id) => media.find((m) => m.id === id))
          .filter((m): m is Media => m !== undefined)
      : []
  );
</script>

{#if blockMedia.length > 0}
  <section>
    {#if config.heading}
      <h2
        class="mb-3 text-[10px] font-semibold tracking-widest uppercase"
        style="color: var(--color-accent)"
      >
        {config.heading}
      </h2>
    {/if}

    {#if displayAs === 'grid'}
      <div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {#each blockMedia as item (item.id)}
          <a
            href={item.originalUrl || item.url}
            target="_blank"
            rel="noopener noreferrer"
            class="group overflow-hidden rounded-xl bg-white/5 transition-all hover:bg-white/10"
          >
            <img
              src={item.thumbnailUrl || item.url}
              alt={item.alt || item.filename}
              loading="lazy"
              class="aspect-square w-full object-cover transition-transform group-hover:scale-105"
            />
          </a>
        {/each}
      </div>
    {:else if displayAs === 'carousel'}
      <div class="flex gap-3 overflow-x-auto pb-2" style="-webkit-overflow-scrolling: touch;">
        {#each blockMedia as item (item.id)}
          <a
            href={item.originalUrl || item.url}
            target="_blank"
            rel="noopener noreferrer"
            class="group flex-shrink-0 overflow-hidden rounded-xl bg-white/5 transition-all hover:bg-white/10"
          >
            <img
              src={item.thumbnailUrl || item.url}
              alt={item.alt || item.filename}
              loading="lazy"
              class="h-48 w-48 object-cover transition-transform group-hover:scale-105 sm:h-56 sm:w-56"
            />
          </a>
        {/each}
      </div>
    {:else if displayAs === 'bento'}
      <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {#each blockMedia as item, i (item.id)}
          {@const isLarge = i === 0 || (i > 0 && (i - 1) % 5 === 0)}
          <a
            href={item.originalUrl || item.url}
            target="_blank"
            rel="noopener noreferrer"
            class="group overflow-hidden rounded-xl bg-white/5 transition-all hover:bg-white/10 {isLarge
              ? 'col-span-2 row-span-2'
              : ''}"
          >
            <img
              src={item.thumbnailUrl || item.url}
              alt={item.alt || item.filename}
              loading="lazy"
              class="h-full w-full object-cover transition-transform group-hover:scale-105 {isLarge
                ? 'aspect-square'
                : 'aspect-square'}"
            />
          </a>
        {/each}
      </div>
    {/if}
  </section>
{/if}
