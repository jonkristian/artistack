<script lang="ts">
  import { RowThumb } from '$lib/components/ui';
  import type {
    Block,
    ReleasesBlockConfig,
    ReleaseSummary,
    PublicSettings
  } from '$lib/server/schema';

  /**
   * A window onto Releases, not an editor for it.
   *
   * A release owns a page, a cover and a list of services; editing one from
   * inside a block would mean the same record could be renamed from two pages,
   * each looking like its own list.
   */
  let {
    block,
    releases = [],
    settings
  }: {
    block: Block;
    /** `published` comes off the draft, so a draft record is marked as one. */
    releases?: (ReleaseSummary & { published?: boolean })[];
    settings?: PublicSettings | null;
  } = $props();

  const config = $derived((block.config as ReleasesBlockConfig) ?? {});
  const locale = $derived(settings?.locale || 'nb-NO');

  const now = Date.now();
  const isOut = (release: ReleaseSummary) => new Date(release.releaseDate).getTime() <= now;

  const matching = $derived(
    config.filter === 'upcoming'
      ? releases.filter((r) => !isOut(r)).reverse()
      : config.filter === 'out'
        ? releases.filter(isOut)
        : releases
  );
  const shown = $derived(config.limit != null ? matching.slice(0, config.limit) : matching);

  function formatDate(date: Date | string): string {
    return new Intl.DateTimeFormat(locale, {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    }).format(new Date(date));
  }
</script>

<div class="space-y-3">
  {#if matching.length > 0}
    <ul class="space-y-2">
      {#each shown as release (release.id)}
        <li class="flex items-center gap-2.5 text-sm">
          <RowThumb src={release.coverUrl} alt="" />
          <span class="min-w-0 flex-1 truncate text-gray-300">
            {release.title}{#if release.published === false}<span class="text-gray-500">
                · draft</span
              >{/if}
          </span>
          <span class="shrink-0 text-xs text-gray-500">{formatDate(release.releaseDate)}</span>
        </li>
      {/each}
    </ul>

    {#if config.limit != null && matching.length > shown.length}
      <p class="text-xs text-gray-500">Showing {shown.length} of {matching.length}</p>
    {/if}
  {:else}
    <p class="text-sm text-gray-500">No releases yet.</p>
  {/if}

  <a href="/admin/releases" class="inline-block text-sm text-gray-400 hover:text-white">
    Edit releases →
  </a>
</div>
