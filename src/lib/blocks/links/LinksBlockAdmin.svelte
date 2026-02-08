<script lang="ts">
  import type { Block, Link, Media } from '$lib/server/schema';
  import { SortableList } from '$lib/components/ui';
  import { toast } from '$lib/stores/toast.svelte';
  import {
    createLink as serverCreateLink,
    deleteLink as serverDeleteLink
  } from '../../../routes/admin/data.remote';

  let {
    block,
    links,
    media,
    oneditlink
  }: {
    block: Block;
    links: Link[];
    media: Media[];
    oneditlink: (link: Link) => void;
  } = $props();

  // Links belonging to this block
  const blockLinks = $derived(
    links
      .filter((l) => l.blockId === block.id)
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
  );

  // Add link form state
  let newUrl = $state('');
  let adding = $state(false);

  async function handleAddLink() {
    if (!newUrl.trim() || adding) return;

    const urlToAdd = newUrl;
    newUrl = '';
    adding = true;

    try {
      // Create link on server - gets real ID and metadata
      const result = await serverCreateLink({
        url: urlToAdd,
        blockId: block.id
      });

      if (result.link) {
        // Add the server-created link to the array
        links.push(result.link);
        links.length = links.length;
        toast.info('Link added');
      }
    } catch (e) {
      toast.error('Failed to add link');
      newUrl = urlToAdd; // Restore URL on error
    } finally {
      adding = false;
    }
  }

  async function handleDeleteLink(id: number) {
    // Remove from local array immediately
    const index = links.findIndex((l) => l.id === id);
    if (index !== -1) {
      links.splice(index, 1);
      links.length = links.length;
    }

    // Delete from server
    try {
      await serverDeleteLink(id);
    } catch {
      // Silently fail - link is already removed from UI
    }
  }

  function handleReorderLinks(items: Link[]) {
    // Update positions locally
    items.forEach((item, i) => {
      const link = links.find((l) => l.id === item.id);
      if (link) link.position = i;
    });
    links.length = links.length;
  }
</script>

<div class="space-y-3">
  <form
    onsubmit={(e) => {
      e.preventDefault();
      handleAddLink();
    }}
    class="flex gap-2"
  >
    <input
      type="url"
      bind:value={newUrl}
      placeholder="Paste URL..."
      aria-label="Link URL"
      class="flex-1 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-gray-600 focus:outline-none"
    />
    <button
      type="submit"
      disabled={!newUrl.trim() || adding}
      class="rounded-lg bg-white/10 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-white/20 disabled:opacity-50"
    >
      {adding ? 'Adding...' : 'Add'}
    </button>
  </form>

  {#if blockLinks.length > 0}
    <SortableList items={blockLinks} onreorder={handleReorderLinks}>
      {#snippet children(link)}
        <div
          class="group flex items-center justify-between rounded-lg bg-gray-800/50 px-3 py-2 transition-colors hover:bg-gray-800"
        >
          <div class="flex min-w-0 items-center gap-2">
            <div data-drag-handle class="text-gray-600 hover:text-gray-400">
              <svg class="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M4 8h16M4 16h16"
                />
              </svg>
            </div>
            {#if link.thumbnailUrl}
              <img
                src={link.thumbnailUrl}
                alt=""
                loading="lazy"
                class="h-8 w-8 rounded object-cover"
              />
            {/if}
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2">
                <span class="truncate text-sm text-white"
                  >{link.label || link.platform.replace('_', ' ')}</span
                >
                {#if link.embedData && link.embedData.enabled !== false}
                  <span class="text-xs text-violet-400">Player</span>
                {/if}
              </div>
              <span class="text-xs text-gray-500 capitalize">{link.platform.replace('_', ' ')}</span
              >
            </div>
          </div>
          <div class="flex shrink-0 items-center gap-1">
            <button
              onclick={() => oneditlink(link)}
              class="cursor-pointer rounded p-1 text-gray-600 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-gray-700 hover:text-white"
              aria-label="Edit {link.label || link.platform} link"
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
              onclick={() => handleDeleteLink(link.id)}
              class="cursor-pointer rounded p-1 text-gray-600 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-gray-700 hover:text-red-400"
              aria-label="Delete {link.label || link.platform} link"
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
      {/snippet}
    </SortableList>
  {:else}
    <p class="py-2 text-center text-xs text-gray-600">No links yet</p>
  {/if}
</div>
