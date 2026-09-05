<script lang="ts">
  import { RowThumb } from '$lib/components/ui';
  import type { Block, Show, ShowsBlockConfig } from '$lib/server/schema';

  /**
   * A window onto the shows, not an editor for them.
   *
   * Shows belong to the site now, so editing them from inside one block would
   * be editing something the block doesn't own — and doing it here would mean
   * the same tour could be edited from two blocks on two pages, each looking
   * like its own list.
   */
  let {
    block,
    shows
  }: {
    block: Block;
    shows: Show[];
  } = $props();

  const config = $derived((block.config as ShowsBlockConfig) ?? {});

  const today = new Date().toISOString().split('T')[0];
  const upcoming = $derived(shows.filter((t) => t.date >= today));
  const shown = $derived(config.limit != null ? upcoming.slice(0, config.limit) : upcoming);
</script>

<div class="space-y-3">
  {#if upcoming.length > 0}
    <ul class="space-y-2">
      {#each shown as show (show.id)}
        <li class="flex items-center gap-2.5 text-sm">
          <RowThumb src={show.imageUrl} alt="" />
          <span class="min-w-0 flex-1 truncate text-gray-300">
            {show.venue.name}{#if show.venue.city}<span class="text-gray-500">
                , {show.venue.city}</span
              >{/if}
          </span>
          <span class="shrink-0 text-xs text-gray-500">{show.date}</span>
        </li>
      {/each}
    </ul>

    {#if config.limit != null && upcoming.length > shown.length}
      <p class="text-xs text-gray-500">
        Showing {shown.length} of {upcoming.length} upcoming
      </p>
    {/if}
  {:else}
    <p class="text-sm text-gray-500">No upcoming shows.</p>
  {/if}

  <a href="/admin/shows" class="inline-block text-sm text-gray-400 hover:text-white">
    Edit shows →
  </a>
</div>
