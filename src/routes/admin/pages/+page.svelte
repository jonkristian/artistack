<script lang="ts">
  import { fieldClass, labelClass } from '$lib/utils/classes';
  import { goto, invalidateAll } from '$app/navigation';
  import { toast } from '$lib/stores/toast.svelte';
  import { slugify } from '$lib/utils/slug';
  import { SectionCard } from '$lib/components/cards';
  import { LibraryToolbar, SelectCheckbox } from '$lib/components/ui';
  import { Selection } from '$lib/utils/selection.svelte';
  import { createPage, deletePage } from './data.remote';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  let creating = $state(false);
  let saving = $state(false);
  let title = $state('');
  let slug = $state('');

  // The slug follows the title until it's edited by hand, then stops — a slug
  // quietly rewriting itself after you've set it is how you get a dead link.
  let slugTouched = $state(false);
  const slugPreview = $derived(slugify(slugTouched && slug ? slug : title));

  /*
   * Only the ordinary pages. The front page, releases and the shop each own a
   * `pages` row too, but they're singletons or collections with their own
   * section — this is the open-ended remainder, which is the one thing that
   * can't have a nav entry each.
   */
  const listed = $derived(data.pages.filter((p) => p.type === 'custom'));

  /** Live or not — the only thing that distinguishes one ordinary page here. */
  function statusOf(page: { published: boolean | null }): string {
    return page.published ? 'live' : 'draft';
  }

  let statusFilter = $state<string[]>([]);

  const statusOptions = $derived(
    [
      { key: 'live', label: 'Live' },
      { key: 'draft', label: 'Draft' }
    ].map((option) => ({
      ...option,
      count: listed.filter((p) => statusOf(p) === option.key).length
    }))
  );

  const shown = $derived(
    statusFilter.length === 0 ? listed : listed.filter((p) => statusFilter.includes(statusOf(p)))
  );

  const selection = new Selection();

  async function deleteSelected() {
    const count = selection.size;
    if (count === 0) return;
    if (!confirm(`Delete ${count} page${count > 1 ? 's' : ''} and everything on them?`)) return;

    for (const id of selection.ids) {
      await deletePage({ id });
    }
    await invalidateAll();
    toast.info(`Deleted ${count} page${count > 1 ? 's' : ''}`);
    selection.clear();
  }

  function reset() {
    creating = false;
    title = '';
    slug = '';
    slugTouched = false;
  }

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (saving) return;

    saving = true;
    try {
      const created = await createPage({ title, slug: slugTouched ? slug : undefined });
      reset();
      await invalidateAll();
      await goto(`/admin/pages/${created.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not create the page');
    } finally {
      saving = false;
    }
  }
</script>

<div class="min-h-screen bg-gray-950 p-[clamp(1rem,4vw,1.5rem)]">
  <LibraryToolbar
    options={statusOptions}
    bind:selected={statusFilter}
    total={listed.length}
    onFilterChange={() => selection.clear()}
    count={selection.size}
    allSelected={selection.covers(shown)}
    onToggleAll={() => selection.toggleAll(shown)}
    onDelete={deleteSelected}
    onClear={() => selection.clear()}
  >
    {#snippet actions()}
      {#if !creating}
        <button
          type="button"
          class="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium whitespace-nowrap text-white transition hover:bg-violet-500"
          onclick={() => (creating = true)}
        >
          New page
        </button>
      {/if}
    {/snippet}
  </LibraryToolbar>

  {#if creating}
    <div class="mt-4">
      <SectionCard title="New page">
        <form onsubmit={submit} class="space-y-4">
          <div>
            <label for="page-title" class={labelClass}>Title</label>
            <input
              id="page-title"
              type="text"
              bind:value={title}
              placeholder="About"
              class={fieldClass}
              required
            />
          </div>

          <div>
            <label for="page-slug" class={labelClass}>Address</label>
            <input
              id="page-slug"
              type="text"
              value={slugTouched ? slug : slugPreview}
              oninput={(e) => {
                slugTouched = true;
                slug = e.currentTarget.value;
              }}
              placeholder="about"
              class={fieldClass}
            />
            <p class="mt-2 text-sm text-gray-500">
              The page will live at <span class="text-gray-400">/{slugPreview || '…'}</span>
            </p>
          </div>

          <div class="flex gap-2">
            <button
              type="submit"
              disabled={saving || !title.trim()}
              class="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-violet-500 disabled:opacity-50"
            >
              {saving ? 'Creating…' : 'Create page'}
            </button>
            <button
              type="button"
              onclick={reset}
              class="rounded-lg px-4 py-2 text-sm text-gray-400 transition hover:text-white"
            >
              Cancel
            </button>
          </div>
        </form>
      </SectionCard>
    </div>
  {/if}

  {#if listed.length === 0 && !creating}
    <div class="rounded-xl border border-dashed border-gray-800 p-10 text-center">
      <p class="text-sm text-gray-400">No pages yet.</p>
      <p class="mt-1 text-xs text-gray-600">
        An about or a contact — anything that isn't the front page, a release or the shop.
      </p>
    </div>
  {/if}

  {#if shown.length > 0}
    <ul class="space-y-2">
      {#each shown as page (page.id)}
        <li
          class="flex items-center gap-3 rounded-xl border border-gray-800 bg-gray-900 px-4 py-3 transition-colors hover:border-gray-700"
        >
          <SelectCheckbox
            checked={selection.has(page.id)}
            onclick={() => selection.toggle(page.id)}
          />
          <a href="/admin/pages/{page.id}" class="min-w-0 flex-1">
            <span class="block truncate text-sm text-white">{page.title}</span>
            <span class="mt-0.5 block truncate text-xs text-gray-500">/{page.slug}</span>
          </a>

          {#if !page.published}
            <span class="rounded-full bg-gray-800 px-2 py-0.5 text-xs text-gray-400">Draft</span>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</div>
