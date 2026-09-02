<script lang="ts">
  import { formatPrice } from '$lib/utils/price';
  import {
    PAYMENT_LABELS,
    PAYMENT_TONE,
    FULFILMENT_LABELS,
    awaitingCapture
  } from '$lib/utils/order';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  const locale = $derived(data.settings?.locale || 'nb-NO');
  const formatDate = $derived(
    new Intl.DateTimeFormat(locale, {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    })
  );

  /*
   * An order with money reserved and nothing posted is the only thing on this
   * screen that rots — the reservation lapses and the sale is lost — so it's
   * counted at the top rather than left to be spotted in the list.
   */
  const toPost = $derived(
    data.orders.filter(
      (order) => awaitingCapture(order.paymentStatus) && order.fulfilment !== 'shipped'
    )
  );
</script>

<div class="min-h-screen bg-gray-950 p-[clamp(1rem,4vw,1.5rem)]">
  <div class="mb-6 flex flex-wrap items-center justify-between gap-3">
    <div>
      <h1 class="text-sm font-medium tracking-wider text-gray-400 uppercase">Orders</h1>
      {#if toPost.length > 0}
        <p class="mt-1 text-xs text-amber-400">
          {toPost.length}
          {toPost.length === 1 ? 'order is' : 'orders are'} waiting to be posted — the money is only reserved
          until then
        </p>
      {/if}
    </div>
  </div>

  {#if data.orders.length === 0}
    <div class="rounded-xl border border-dashed border-gray-800 p-10 text-center">
      <p class="text-sm text-gray-400">Nothing sold yet.</p>
      <p class="mt-1 text-xs text-gray-600">Orders show up here the moment someone pays.</p>
    </div>
  {:else}
    <div class="overflow-hidden rounded-xl border border-gray-800">
      {#each data.orders as order (order.id)}
        <a
          href="/admin/shop/orders/{order.id}"
          class="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-gray-800 bg-gray-900 p-4 transition-colors last:border-b-0 hover:bg-gray-800/60"
        >
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-medium text-white">{order.buyerName}</p>
            <p class="truncate text-xs text-gray-500">
              {order.reference}{#if order.createdAt}{' · '}{formatDate.format(
                  new Date(order.createdAt)
                )}{/if}
            </p>
          </div>

          <span class="text-sm text-gray-300 tabular-nums">
            {formatPrice(order.amount, order.currency, locale)}
          </span>

          <div class="flex shrink-0 items-center gap-2">
            <span
              class="rounded px-2 py-1 text-[11px] font-medium {PAYMENT_TONE[order.paymentStatus]}"
            >
              {PAYMENT_LABELS[order.paymentStatus]}
            </span>
            <!-- Only once it's paid for. "Not sent" against an unpaid order
                 reads as something you forgot to do. -->
            {#if order.paymentStatus === 'authorised' || order.paymentStatus === 'captured'}
              <span class="rounded bg-gray-700/50 px-2 py-1 text-[11px] font-medium text-gray-400">
                {FULFILMENT_LABELS[order.fulfilment]}
              </span>
            {/if}
          </div>
        </a>
      {/each}
    </div>
  {/if}
</div>
