<script lang="ts">
  import { fieldClass, labelClass } from '$lib/utils/classes';
  import { ToggleSwitch, MediaPicker, TagInput } from '$lib/components/ui';
  import { SectionCard } from '$lib/components/cards';
  import { goto, invalidateAll } from '$app/navigation';
  import { toast } from '$lib/stores/toast.svelte';
  import { tick } from 'svelte';
  import { formatPrice } from '$lib/utils/price';
  import { slugify } from '$lib/utils/slug';
  import { totalStock } from '$lib/utils/variants';
  import * as draft from '$lib/stores/pageDraft.svelte';
  import { buildDraftFromServerData, type UnifiedDraftData } from '../../publishDraft';
  import { deleteProduct } from '../data.remote';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  /*
   * Edits go into the shared draft, so this page behaves like every other
   * editor in here: the sidebar shows unsaved changes, Undo reverts them, and
   * Update commits them. Nothing on this page saves on its own.
   */
  const draftData = draft.getData<UnifiedDraftData>();
  const product = $derived(draftData.products?.find((p) => p.id === data.product.id));

  /*
   * Options, edited in place on the draft like everything else here.
   *
   * Sizes were the case in hand, but a record comes in colours and a print in
   * formats — so the list is a name and a count, and what they're options *of*
   * is asked once as a label. A product either has them or it doesn't: with
   * options the stock lives on each one and the single Stock field above is
   * meaningless, so the two swap rather than sitting side by side claiming
   * different numbers.
   */
  /*
   * The raw list, not `variantsOf`.
   *
   * That helper drops options with no name, which is right everywhere it's
   * read and wrong here: a row starts empty, so filtering it out meant Add did
   * nothing you could see. Totals still use the filtered one — a half-typed row
   * shouldn't count towards stock.
   */
  const variants = $derived(product?.variants ?? []);

  /*
   * A name back to the tag it already is, where one exists.
   *
   * The draft compares products field by field, so a set rebuilt from names
   * alone would differ from the snapshot on every load and report an edit that
   * never happened. An unknown name gets id 0 — it doesn't exist yet, and the
   * server assigns the real one.
   */
  function toTag(name: string) {
    return data.tags?.find((t) => t.name === name) ?? { id: 0, name, slug: slugify(name) };
  }

  function addVariant() {
    if (!product) return;
    product.variants = [...(product.variants ?? []), { name: '', stock: null }];
  }

  function removeVariant(index: number) {
    if (!product) return;
    const next = (product.variants ?? []).filter((_, i) => i !== index);
    // Back to null rather than an empty array, so "has no sizes" is one state
    // in the database instead of two that behave the same.
    product.variants = next.length > 0 ? next : null;
  }

  function setVariantName(index: number, name: string) {
    if (!product) return;
    product.variants = (product.variants ?? []).map((v, i) => (i === index ? { ...v, name } : v));
  }

  function setVariantStock(index: number, value: string) {
    if (!product) return;
    const trimmed = value.trim();
    const parsed = trimmed === '' ? null : Math.round(Number(trimmed));
    if (parsed != null && (Number.isNaN(parsed) || parsed < 0)) return;
    product.variants = (product.variants ?? []).map((v, i) =>
      i === index ? { ...v, stock: parsed } : v
    );
  }

  /*
   * Price is typed in major units and stored in minor ones. It's held as text
   * so a half-typed "12." isn't rounded away under the cursor, and written back
   * to the draft on each change.
   */
  let priceText = $state('');
  let stockText = $state('');
  let seededFor = $state<number | null>(null);

  $effect(() => {
    if (!product || seededFor === product.id) return;
    seededFor = product.id;
    priceText = product.price == null ? '' : String(product.price / 100);
    stockText = product.stock == null ? '' : String(product.stock);
  });

  function commitPrice() {
    if (!product) return;
    const trimmed = priceText.replace(',', '.').trim();
    if (trimmed === '') {
      product.price = null;
      return;
    }
    const minor = Math.round(Number(trimmed) * 100);
    if (!Number.isNaN(minor) && minor >= 0) product.price = minor;
  }

  function commitStock() {
    if (!product) return;
    const trimmed = stockText.trim();
    if (trimmed === '') {
      product.stock = null;
      return;
    }
    const n = Math.round(Number(trimmed));
    if (!Number.isNaN(n) && n >= 0) product.stock = n;
  }

  const pricePreview = $derived(
    formatPrice(product?.price, product?.currency, data.settings?.locale)
  );

  const fileName = $derived(
    product?.fileUrl
      ? ((data.media ?? []).find((m) => m.url === product.fileUrl)?.filename ?? 'Selected')
      : null
  );

  /**
   * Immediate, like every other delete in the admin: it removes a row the draft
   * is holding, so the draft is re-seeded afterwards.
   */
  async function remove() {
    if (!product) return;
    if (!confirm(`Delete “${product.name}”?`)) return;

    await deleteProduct({ id: product.id });
    await invalidateAll();
    await tick();
    draft.initialize(buildDraftFromServerData(data));
    toast.info('Product deleted');
    await goto('/admin/shop');
  }
</script>

<div class="min-h-screen bg-gray-950 p-[clamp(1rem,4vw,1.5rem)]">
  {#if !product}
    <p class="text-sm text-gray-500">This product is no longer in the draft.</p>
  {:else}
    <div class="max-w-2xl space-y-4">
      <SectionCard title="Details">
        {#snippet actions()}
          <div class="flex items-center gap-2">
            <span class="text-sm {product.visible ? 'text-gray-400' : 'text-gray-500'}">
              {product.visible ? 'In the shop' : 'Hidden'}
            </span>
            <ToggleSwitch
              checked={product.visible ?? false}
              label="Show this product in the shop"
              onchange={(v) => (product.visible = v)}
              size="md"
              hideLabel
            />
          </div>
        {/snippet}

        <div class="space-y-4">
          <div>
            <label for="product-name" class={labelClass}>Name</label>
            <input id="product-name" type="text" bind:value={product.name} class={fieldClass} />
          </div>

          <div>
            <label for="product-description" class={labelClass}>Description</label>
            <textarea
              id="product-description"
              value={product.description ?? ''}
              oninput={(e) => (product.description = e.currentTarget.value || null)}
              rows="3"
              class={fieldClass}
              placeholder="Sizes, pressing details, what's included…"
            ></textarea>
          </div>

          <div class="grid gap-4 sm:grid-cols-2">
            <div>
              <label for="product-price" class={labelClass}>Price</label>
              <input
                id="product-price"
                type="text"
                inputmode="decimal"
                bind:value={priceText}
                oninput={commitPrice}
                placeholder="250"
                class={fieldClass}
              />
              <p class="mt-2 text-sm text-gray-500">
                Shows as {pricePreview}. Leave empty for “ask”.
              </p>
            </div>
            <div>
              <label for="product-currency" class={labelClass}>Currency</label>
              <select id="product-currency" bind:value={product.currency} class={fieldClass}>
                <option value="NOK">NOK</option>
                <option value="EUR">EUR</option>
                <option value="USD">USD</option>
                <option value="GBP">GBP</option>
                <option value="SEK">SEK</option>
                <option value="DKK">DKK</option>
              </select>
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="What it is">
        <div class="space-y-4">
          <!-- One thing or the other, so a switch rather than two buttons
               pretending to be a choice between many. -->
          <div class="flex items-center justify-between gap-3 rounded-lg bg-gray-800/50 px-4 py-3">
            <div>
              <p class="text-sm text-white">Digital product</p>
              <p class="text-xs text-gray-500">
                A download rather than something you post. It decides whether a sale needs an
                address, and whether it's charged straight away.
              </p>
            </div>
            <ToggleSwitch
              checked={product.type === 'digital'}
              label="This is a download"
              onchange={(v) => (product.type = v ? 'digital' : 'physical')}
              size="md"
              hideLabel
            />
          </div>

          {#if product.type === 'physical'}
            {#if variants.length === 0}
              <div>
                <label for="product-stock" class={labelClass}>Stock</label>
                <input
                  id="product-stock"
                  type="text"
                  inputmode="numeric"
                  bind:value={stockText}
                  oninput={commitStock}
                  placeholder="Unlimited"
                  class={fieldClass}
                />
                <p class="mt-2 text-sm text-gray-500">
                  Empty means unlimited. Zero shows as sold out rather than hiding it.
                </p>
              </div>
            {/if}

            <div>
              <span class={labelClass}>Options</span>

              {#if variants.length === 0}
                <p class="mb-2 text-sm text-gray-500">
                  For a shirt that comes in sizes, a record in colours, a print in formats. Each
                  option keeps its own stock, so you can sell out of one without touching the rest.
                </p>
              {:else}
                <!-- What the choice is called, asked once rather than assumed.
                     It's the heading a buyer sees above the options. -->
                <div class="mb-3">
                  <label for="product-variant-label" class="mb-1 block text-xs text-gray-500">
                    What varies
                  </label>
                  <input
                    id="product-variant-label"
                    type="text"
                    value={product.variantLabel ?? ''}
                    oninput={(e) => (product.variantLabel = e.currentTarget.value || null)}
                    placeholder="Size"
                    class={fieldClass}
                  />
                </div>

                <p class="mb-2 text-sm text-gray-500">
                  Stock lives on each option now, so the single Stock field above is gone.
                </p>

                <div class="space-y-2">
                  {#each variants as option, index (index)}
                    <div class="flex gap-2">
                      <!--
                        The sizing goes on a wrapper, not on the input.
                        `fieldClass` already carries `w-full`, and two width
                        utilities on one element are settled by their order in
                        the generated stylesheet rather than in this string — so
                        the name field collapsed to a sliver while the stock
                        field took the row.
                      -->
                      <div class="min-w-0 flex-1">
                        <input
                          type="text"
                          value={option.name}
                          oninput={(e) => setVariantName(index, e.currentTarget.value)}
                          placeholder={product.variantLabel?.trim() === 'Colour' ? 'Black' : 'M'}
                          aria-label="Option name"
                          class={fieldClass}
                        />
                      </div>
                      <div class="w-32 shrink-0">
                        <input
                          type="text"
                          inputmode="numeric"
                          value={option.stock ?? ''}
                          oninput={(e) => setVariantStock(index, e.currentTarget.value)}
                          placeholder="Unlimited"
                          aria-label="Stock for this option"
                          class={fieldClass}
                        />
                      </div>
                      <button
                        type="button"
                        onclick={() => removeVariant(index)}
                        class="shrink-0 rounded-lg px-3 text-sm text-gray-500 transition-colors hover:bg-red-950/40 hover:text-red-400"
                        aria-label="Remove this option"
                      >
                        ✕
                      </button>
                    </div>
                  {/each}
                </div>

                <!-- Named rather than counted, because a bare number here is
                     ambiguous the moment an option is unlimited. -->
                <p class="mt-2 text-sm text-gray-500">
                  {#if totalStock(product) == null}
                    Unlimited overall.
                  {:else}
                    {totalStock(product)} in total.
                  {/if}
                </p>
              {/if}

              <button
                type="button"
                onclick={addVariant}
                class="mt-2 rounded-lg border border-dashed border-gray-700 px-3 py-2 text-sm text-gray-400 transition-colors hover:border-gray-500 hover:text-gray-200"
              >
                Add an option
              </button>
            </div>
          {:else}
            <div>
              <span class={labelClass}>File</span>
              <MediaPicker
                value={product.fileUrl}
                label="Download"
                media={data.media}
                kind="all"
                noCrop
                onselect={(url: string | null) => (product.fileUrl = url)}
              />
              {#if fileName}
                <p class="mt-2 text-sm text-gray-400">{fileName}</p>
              {/if}
              <p class="mt-2 text-sm text-gray-500">
                What the buyer gets. Separate from the picture — a sleeve isn't the record.
              </p>
            </div>
          {/if}

          <div>
            <span class={labelClass}>Tags</span>
            <!--
              The same vocabulary clips and media use, rather than a category
              of the shop's own. One list of words across the site means a shop
              block can show "what is tagged merch" and mean the same thing the
              rest of the admin does.

              Keyed on the product so switching between two reseeds the chips —
              TagInput reads `initial` once by design.
            -->
            {#key product.id}
              <TagInput
                initial={(product.tags ?? []).map((t) => t.name)}
                suggestions={data.tags?.map((t) => t.name) ?? []}
                placeholder="Merch, vinyl, limited…"
                onchange={(names) => (product.tags = names.map(toTag))}
              />
            {/key}
            <p class="mt-2 text-sm text-gray-500">
              Groups products so a shop block can show just one kind. Shared with clips and media.
            </p>
          </div>

          <div>
            <label for="product-url" class={labelClass}>Buy elsewhere</label>
            <input
              id="product-url"
              type="url"
              value={product.externalUrl ?? ''}
              oninput={(e) => (product.externalUrl = e.currentTarget.value || null)}
              placeholder="https://"
              class={fieldClass}
            />
            <p class="mt-2 text-sm text-gray-500">
              Bandcamp, Big Cartel. Only used when there's no price — otherwise this sells through
              the basket.
            </p>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Picture">
        <MediaPicker
          value={product.imageUrl}
          label="Product photo"
          media={data.media}
          aspectRatio="1/1"
          kind="image"
          onselect={(url: string | null) => (product.imageUrl = url)}
        />
      </SectionCard>

      <!-- Last thing in the column, so it can't be hit on the way to anything
         else. -->
      <button
        type="button"
        onclick={remove}
        class="mt-6 w-full rounded-xl border border-red-900/60 bg-red-950/40 px-4 py-3 text-sm text-red-400 transition-colors hover:border-red-600 hover:bg-red-600 hover:text-white"
      >
        Delete product
      </button>
    </div>
  {/if}
</div>
