<script lang="ts">
  import { fieldClass, labelClass, tileGridClass } from '$lib/utils/classes';
  import { goto, invalidateAll } from '$app/navigation';
  import { toast } from '$lib/stores/toast.svelte';
  import { SectionCard } from '$lib/components/cards';
  import { LibraryToolbar, SelectCheckbox } from '$lib/components/ui';
  import { Selection } from '$lib/utils/selection.svelte';
  import { formatPrice } from '$lib/utils/price';
  import { isSoldOut, totalStock, variantsOf } from '$lib/utils/variants';
  import * as draft from '$lib/stores/pageDraft.svelte';
  import { buildDraftFromServerData, type UnifiedDraftData } from '../publishDraft';
  import { tick } from 'svelte';
  import { createProduct, deleteProduct } from './data.remote';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  const draftData = draft.getData<UnifiedDraftData>();

  // Straight off the draft, so a renamed or hidden product shows here before
  // it's published — the same as the releases list.
  const allProducts = $derived(draftData.products ?? []);

  let creating = $state(false);
  let saving = $state(false);
  let name = $state('');

  function reset() {
    creating = false;
    name = '';
  }

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (saving) return;

    saving = true;
    try {
      const created = await createProduct({ name });
      reset();
      await invalidateAll();
      await tick();
      /*
       * The layout seeds the draft once, when it mounts, so a product created
       * after that isn't in it — and its editor would have nothing to bind to.
       */
      draft.initialize(buildDraftFromServerData(data));
      await goto(`/admin/shop/${created.product.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not create the product');
    } finally {
      saving = false;
    }
  }

  /**
   * Hidden, in stock, sold out — the three states worth filtering by. Sold out
   * is derived rather than stored: it's nothing left anywhere, and a second
   * column saying so could only disagree with the count. With sizes that means
   * every size gone, not the product's own number — which means nothing once
   * sizes exist.
   */
  function statusOf(product: (typeof allProducts)[number]): string {
    if (!product.visible) return 'hidden';
    return isSoldOut(product) ? 'sold-out' : 'live';
  }

  let statusFilter = $state<string[]>([]);

  const statusOptions = $derived(
    [
      { key: 'live', label: 'Live' },
      { key: 'sold-out', label: 'Sold out' },
      { key: 'hidden', label: 'Hidden' }
    ].map((option) => ({
      ...option,
      count: allProducts.filter((p) => statusOf(p) === option.key).length
    }))
  );

  // Off the draft either way. It used to fall back to the server copy when
  // nothing was filtered, so a renamed product showed its old name until the
  // moment you filtered.
  const shown = $derived(
    statusFilter.length === 0
      ? allProducts
      : allProducts.filter((p) => statusFilter.includes(statusOf(p)))
  );

  const selection = new Selection();

  async function deleteSelected() {
    const count = selection.size;
    if (count === 0) return;
    if (!confirm(`Delete ${count} product${count > 1 ? 's' : ''}?`)) return;

    for (const id of selection.ids) {
      await deleteProduct({ id });
    }
    await invalidateAll();
    await tick();
    draft.initialize(buildDraftFromServerData(data));
    toast.info(`Deleted ${count} product${count > 1 ? 's' : ''}`);
    selection.clear();
  }
</script>

<div class="min-h-screen bg-gray-950 p-[clamp(1rem,4vw,1.5rem)]">
  <LibraryToolbar
    options={statusOptions}
    bind:selected={statusFilter}
    total={allProducts.length}
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
          New product
        </button>
      {/if}
    {/snippet}
  </LibraryToolbar>

  {#if creating}
    <div class="mb-6">
      <SectionCard title="New product">
        <form onsubmit={submit} class="space-y-4">
          <div>
            <label for="product-name" class={labelClass}>Name</label>
            <input
              id="product-name"
              type="text"
              bind:value={name}
              placeholder="T-shirt"
              class={fieldClass}
              required
            />
            <p class="mt-2 text-sm text-gray-500">
              It starts hidden — set a price and a picture, then make it visible.
            </p>
          </div>

          <div class="flex gap-2">
            <button
              type="submit"
              disabled={saving || !name.trim()}
              class="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-violet-500 disabled:opacity-50"
            >
              {saving ? 'Creating…' : 'Create product'}
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

  {#if allProducts.length === 0 && !creating}
    <div class="rounded-xl border border-dashed border-gray-800 p-10 text-center">
      <p class="text-sm text-gray-400">Nothing in the shop yet.</p>
      <p class="mt-1 text-xs text-gray-600">
        A record, a shirt, a download — anything you'd sell from your own site.
      </p>
    </div>
  {/if}

  {#if shown.length > 0}
    <div class={tileGridClass}>
      {#each shown as product (product.id)}
        <!-- The checkbox is a sibling of the link, not inside it: a button
             nested in an anchor is invalid markup. -->
        <div
          class="group relative overflow-hidden rounded-xl bg-gray-800 {selection.has(product.id)
            ? 'ring-2 ring-violet-500'
            : ''}"
        >
          <SelectCheckbox
            checked={selection.has(product.id)}
            onclick={() => selection.toggle(product.id)}
          />
          <a href="/admin/shop/{product.id}" class="block">
            <!-- Square, like a release cover: merch photography is usually shot
                 square, and it keeps the grid even. -->
            <div class="aspect-square bg-gray-900 {product.visible ? '' : 'opacity-50'}">
              {#if product.imageUrl}
                <img
                  src={product.imageUrl}
                  alt=""
                  loading="lazy"
                  class="h-full w-full object-cover"
                />
              {:else}
                <div
                  class="flex h-full w-full flex-col items-center justify-center gap-2 text-gray-700"
                >
                  <svg class="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="1.5"
                      d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"
                    />
                  </svg>
                  <span class="text-xs">No picture</span>
                </div>
              {/if}
            </div>

            {#if !product.visible}
              <span
                class="absolute top-2 right-2 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-gray-400 uppercase"
              >
                Hidden
              </span>
            {:else if isSoldOut(product)}
              <span
                class="absolute top-2 right-2 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-white uppercase"
              >
                Sold out
              </span>
            {/if}

            <div class="p-3 {product.visible ? '' : 'opacity-60'}">
              <h2 class="truncate text-sm font-medium text-white">{product.name}</h2>
              <p class="mt-0.5 truncate text-xs text-gray-500">
                {formatPrice(product.price, product.currency, data.settings?.locale)}
              </p>
              <!-- Tags included so a set of products can be scanned for the one
                   filed under a typo. -->
              <p class="mt-0.5 truncate text-[11px] text-gray-600">
                {product.type === 'digital'
                  ? 'Download'
                  : 'Posted'}{#if variantsOf(product).length > 0}{' · '}{variantsOf(product).length}
                  sizes{/if}{#if totalStock(product) != null}{' · '}{totalStock(product)}
                  left{/if}{#if product.tags.length > 0}{' · '}{product.tags
                    .map((t) => t.name)
                    .join(', ')}{/if}
              </p>
            </div>
          </a>
        </div>
      {/each}
    </div>
  {/if}
</div>
