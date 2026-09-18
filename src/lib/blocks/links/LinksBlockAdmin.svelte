<script lang="ts">
  import type { Block, Link, Media } from '$lib/server/schema';
  import { SortableList } from '$lib/components/ui';
  import LinkRow from '$lib/components/admin/LinkRow.svelte';
  import { toast } from '$lib/stores/toast.svelte';
  import { detectPlatformFromUrl } from '$lib/utils/platforms';
  import { getTempId } from '$lib/stores/pageDraft.svelte';
  import { createLink as serverCreateLink } from '../../../routes/admin/data.remote';

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
      if (block.id < 0) {
        // Block is unsaved — add a draft-only link (publish will create it with the real blockId)
        const detected = detectPlatformFromUrl(urlToAdd);
        let platform = detected?.platform;
        if (!platform) {
          try {
            platform = new URL(urlToAdd).hostname.replace('www.', '').split('.')[0];
          } catch {
            platform = 'link';
          }
        }
        const category = detected?.category === 'event' ? 'other' : detected?.category || 'other';

        const tempLink: Link = {
          id: getTempId(),
          blockId: block.id,
          releaseId: null,
          category,
          platform: platform || 'link',
          url: urlToAdd,
          label: null,
          thumbnailUrl: null,
          embedData: null,
          position: links.filter((l) => l.blockId === block.id).length,
          visible: true
        };
        links.push(tempLink);
        toast.info('Link added');
      } else {
        // Block exists on server — create link immediately
        const result = await serverCreateLink({
          url: urlToAdd,
          blockId: block.id
        });

        if (result.link) {
          links.push(result.link);
          toast.info('Link added');
        }
      }
    } catch (e) {
      toast.error('Failed to add link');
      newUrl = urlToAdd;
    } finally {
      adding = false;
    }
  }

  /*
   * Out of the draft only. Publishing is what deletes the row.
   *
   * This used to delete on the server the moment you pressed Remove, which
   * broke twice over: Update then found the diff still asking for a deletion
   * that had already happened and failed the whole save with "Link not found",
   * and Undo put the link back on screen while the row stayed gone — so the
   * next reload lost it with no warning.
   *
   * Nothing else on this page saves on its own, and this shouldn't either.
   */
  function handleDeleteLink(id: number) {
    const index = links.findIndex((l) => l.id === id);
    if (index !== -1) {
      links.splice(index, 1);
    }
  }

  function handleReorderLinks(items: Link[]) {
    // Update positions locally
    items.forEach((item, i) => {
      const link = links.find((l) => l.id === item.id);
      if (link) link.position = i;
    });
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
        <LinkRow {link} onedit={oneditlink} ondelete={handleDeleteLink} />
      {/snippet}
    </SortableList>
  {:else}
    <div
      class="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-600 px-4 py-8 text-center"
    >
      <svg class="mb-2 h-8 w-8 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="1.5"
          d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
        />
      </svg>
      <span class="text-sm text-gray-400">Paste a URL above to add a link</span>
    </div>
  {/if}
</div>
