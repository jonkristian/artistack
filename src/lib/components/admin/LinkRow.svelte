<script lang="ts">
  import type { Link } from '$lib/server/schema';
  import { platformIcons, platformLabel, contrastSafeColor } from '$lib/utils/platforms';

  /**
   * One link in an admin list — a links block, a release's services — so every
   * list of links in here looks and behaves the same. Dragged by its handle
   * inside a SortableList; edit and delete appear on hover.
   */
  let {
    link,
    onedit,
    ondelete
  }: {
    link: Link;
    onedit: (link: Link) => void;
    ondelete: (id: number) => void;
  } = $props();

  const title = $derived(link.label || platformLabel(link.platform));
  // The platform, unless the title already says it — a release's services are
  // labelled with their platform, and "Spotify / Spotify" says nothing twice.
  const subtitle = $derived(
    title === platformLabel(link.platform)
      ? link.url.replace(/^https?:\/\//, '')
      : platformLabel(link.platform)
  );
  const icon = $derived(platformIcons[link.platform] ?? null);
  const badge = $derived(
    link.embedData && link.embedData.enabled !== false
      ? ['github', 'gitlab', 'codeberg'].includes(link.embedData.platform)
        ? 'Card'
        : 'Player'
      : null
  );
</script>

<div
  class="group flex items-center justify-between rounded-lg bg-gray-800/50 px-3 py-2 transition-colors hover:bg-gray-800"
>
  <div class="flex min-w-0 items-center gap-2">
    <div data-drag-handle class="cursor-grab text-gray-600 hover:text-gray-400">
      <svg class="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8h16M4 16h16" />
      </svg>
    </div>
    {#if link.thumbnailUrl}
      <img
        src={link.thumbnailUrl}
        alt=""
        loading="lazy"
        class="h-8 w-8 shrink-0 rounded object-cover"
      />
    {:else}
      <!-- Same footprint as a thumbnail, so rows with and without one line up. -->
      <div
        class="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-gray-900 text-xs font-bold text-gray-400"
        aria-hidden="true"
      >
        {#if icon}
          <svg
            viewBox="0 0 24 24"
            class="h-4 w-4"
            fill={contrastSafeColor(link.platform, '#101828', '#d1d5dc')}
          >
            <path d={icon} />
          </svg>
        {:else}
          {link.platform.charAt(0).toUpperCase()}
        {/if}
      </div>
    {/if}
    <div class="min-w-0 flex-1">
      <div class="flex items-center gap-2">
        <span class="truncate text-sm text-white">{title}</span>
        {#if badge}
          <span class="text-xs text-violet-400">{badge}</span>
        {/if}
      </div>
      <span class="block truncate text-xs text-gray-500">{subtitle}</span>
    </div>
  </div>
  <div class="flex shrink-0 items-center gap-1">
    <button
      type="button"
      onclick={() => onedit(link)}
      class="cursor-pointer rounded p-1 text-gray-600 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-gray-700 hover:text-white focus-visible:opacity-100"
      aria-label="Edit {title} link"
    >
      <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
        />
      </svg>
    </button>
    <button
      type="button"
      onclick={() => ondelete(link.id)}
      class="cursor-pointer rounded p-1 text-gray-600 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-gray-700 hover:text-red-400 focus-visible:opacity-100"
      aria-label="Delete {title} link"
    >
      <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M6 18L18 6M6 6l12 12"
        />
      </svg>
    </button>
  </div>
</div>
