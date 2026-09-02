<script lang="ts">
  import { SectionCard } from '$lib/components/cards';
  import { formatPrice } from '$lib/utils/price';
  import {
    PAYMENT_LABELS,
    PAYMENT_TONE,
    FULFILMENT_LABELS,
    awaitingCapture
  } from '$lib/utils/order';
  import { toast } from '$lib/stores/toast.svelte';
  import { goto, invalidateAll } from '$app/navigation';
  import { setFulfilment, captureOrder, refreshPaymentStatus, deleteOrder } from '../data.remote';
  import type { Fulfilment } from '$lib/server/schema';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  const locale = $derived(data.settings?.locale || 'nb-NO');
  const money = (minor: number) => formatPrice(minor, data.order.currency, locale);

  const formatDate = $derived(
    new Intl.DateTimeFormat(locale, {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  );

  const paid = $derived(
    data.order.paymentStatus === 'authorised' || data.order.paymentStatus === 'captured'
  );
  const hasPost = $derived(data.items.some((item) => item.type === 'physical'));
  const reserved = $derived(awaitingCapture(data.order.paymentStatus));

  let busy = $state(false);

  const STEPS: { key: Fulfilment; label: string }[] = [
    { key: 'none', label: 'Not sent' },
    { key: 'packed', label: 'Packed' },
    { key: 'shipped', label: 'Posted' },
    { key: 'delivered', label: 'Delivered' }
  ];

  async function markAs(fulfilment: Fulfilment) {
    if (busy || fulfilment === data.order.fulfilment) return;

    /*
     * Posting it takes the money, and that can't be undone from here. Said
     * before it happens rather than reported after.
     */
    if (fulfilment === 'shipped' && reserved) {
      const ok = confirm(
        `Marking this posted will charge ${money(data.order.amount)}. This cannot be undone from Artistack.`
      );
      if (!ok) return;
    }

    busy = true;
    try {
      const result = await setFulfilment({ id: data.order.id, fulfilment });
      await invalidateAll();
      toast.info(result.captured ? `Charged ${money(data.order.amount)}` : 'Order updated');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update the order');
    } finally {
      busy = false;
    }
  }

  async function charge() {
    if (busy) return;
    if (!confirm(`Charge ${money(data.order.amount)} now?`)) return;

    busy = true;
    try {
      await captureOrder({ id: data.order.id });
      await invalidateAll();
      toast.info(`Charged ${money(data.order.amount)}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not take the payment');
    } finally {
      busy = false;
    }
  }

  async function refresh() {
    if (busy) return;
    busy = true;
    try {
      const result = await refreshPaymentStatus({ id: data.order.id });
      await invalidateAll();
      toast.info(`The provider says: ${PAYMENT_LABELS[result.status]}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not reach the payment provider');
    } finally {
      busy = false;
    }
  }

  async function remove() {
    if (!confirm(`Delete order ${data.order.reference}?`)) return;
    try {
      await deleteOrder({ id: data.order.id });
      toast.info('Order deleted');
      await goto('/admin/shop/orders');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not delete the order');
    }
  }
</script>

<div class="min-h-screen bg-gray-950 p-[clamp(1rem,4vw,1.5rem)]">
  <div class="max-w-2xl space-y-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-lg font-medium text-white">{data.order.reference}</h1>
        {#if data.order.createdAt}
          <p class="mt-0.5 text-xs text-gray-500">
            {formatDate.format(new Date(data.order.createdAt))}
          </p>
        {/if}
      </div>
    </div>

    <SectionCard title="Payment">
      {#snippet actions()}
        <span
          class="rounded px-2 py-1 text-[11px] font-medium {PAYMENT_TONE[data.order.paymentStatus]}"
        >
          {PAYMENT_LABELS[data.order.paymentStatus]}
        </span>
      {/snippet}

      <div class="space-y-4">
        <div class="flex items-baseline justify-between">
          <span class="text-sm text-gray-400">Total</span>
          <span class="text-lg font-medium text-white tabular-nums">{money(data.order.amount)}</span
          >
        </div>

        {#if reserved}
          <!-- The state that costs money if it's ignored: a reservation lapses
               and the sale goes with it. -->
          <p class="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-400">
            The money is reserved, not taken. It comes off when you mark this posted — or charge it
            now if it's being collected in person. Reservations expire if they're left.
          </p>
        {/if}

        <div class="flex flex-wrap items-center gap-3">
          {#if reserved}
            <button
              type="button"
              onclick={charge}
              disabled={busy}
              class="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-violet-500 disabled:opacity-50"
            >
              Charge {money(data.order.amount)}
            </button>
          {/if}
          {#if data.order.providerReference}
            <button
              type="button"
              onclick={refresh}
              disabled={busy}
              class="text-sm text-gray-500 transition-colors hover:text-gray-300 disabled:opacity-50"
            >
              Check with {data.order.provider}
            </button>
          {/if}
        </div>
      </div>
    </SectionCard>

    <!-- Only for an order with something to post. A download has no journey. -->
    {#if paid && hasPost}
      <SectionCard title="Posting">
        <div class="flex flex-wrap gap-2">
          {#each STEPS as step (step.key)}
            <button
              type="button"
              onclick={() => markAs(step.key)}
              disabled={busy}
              class="rounded-lg border px-3 py-2 text-sm transition-colors disabled:opacity-50 {data
                .order.fulfilment === step.key
                ? 'border-violet-500 bg-violet-600/20 text-white'
                : 'border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-600'}"
            >
              {step.label}
            </button>
          {/each}
        </div>
        {#if reserved}
          <p class="mt-3 text-xs text-gray-500">Marking it posted also charges the card.</p>
        {/if}
      </SectionCard>
    {/if}

    <SectionCard title="What they bought">
      <ul class="space-y-2">
        {#each data.items as item (item.id)}
          <li class="flex items-center gap-3 text-sm">
            {#if item.imageUrl}
              <img src={item.imageUrl} alt="" class="h-10 w-10 shrink-0 rounded-lg object-cover" />
            {/if}
            <span class="min-w-0 flex-1">
              <span class="text-white">{item.quantity} × {item.name}</span>
              <span class="ml-2 text-xs text-gray-500">
                {item.type === 'digital' ? 'Download' : 'Posted'}
              </span>
              <!-- Worth seeing: a download with no link is one that can't be
                   delivered, and the file having been removed is the reason. -->
              {#if item.type === 'digital' && paid && !item.downloadToken}
                <span class="ml-2 text-xs text-red-400">no download link</span>
              {/if}
            </span>
            <span class="shrink-0 text-gray-400 tabular-nums">
              {money(item.unitPrice * item.quantity)}
            </span>
          </li>
        {/each}
      </ul>
    </SectionCard>

    <SectionCard title="Who">
      <dl class="space-y-3 text-sm">
        <div class="flex justify-between gap-4">
          <dt class="text-gray-500">Name</dt>
          <dd class="text-right text-white">{data.order.buyerName}</dd>
        </div>
        <div class="flex justify-between gap-4">
          <dt class="text-gray-500">Email</dt>
          <dd class="text-right">
            <a href="mailto:{data.order.buyerEmail}" class="text-violet-400 hover:text-violet-300">
              {data.order.buyerEmail}
            </a>
          </dd>
        </div>
        {#if data.order.buyerPhone}
          <div class="flex justify-between gap-4">
            <dt class="text-gray-500">Phone</dt>
            <dd class="text-right text-white">{data.order.buyerPhone}</dd>
          </div>
        {/if}
        {#if data.order.addressLine}
          <div class="flex justify-between gap-4">
            <dt class="text-gray-500">Address</dt>
            <!-- One block, as it would be written on the parcel. -->
            <dd class="text-right whitespace-pre-line text-white">
              {[
                data.order.addressLine,
                [data.order.postcode, data.order.city].filter(Boolean).join(' '),
                data.order.country
              ]
                .filter(Boolean)
                .join('\n')}
            </dd>
          </div>
        {/if}
        {#if data.order.note}
          <div class="flex justify-between gap-4">
            <dt class="text-gray-500">Note</dt>
            <dd class="text-right text-white">{data.order.note}</dd>
          </div>
        {/if}
      </dl>
    </SectionCard>

    <!-- Only an order that never became one. A paid order is a receipt, and
         deleting it would take the buyer's downloads with it. -->
    {#if data.order.paymentStatus === 'pending' || data.order.paymentStatus === 'cancelled'}
      <button
        type="button"
        onclick={remove}
        class="mt-6 w-full rounded-xl border border-red-900/60 bg-red-950/40 px-4 py-3 text-sm text-red-400 transition-colors hover:border-red-600 hover:bg-red-600 hover:text-white"
      >
        Delete this order
      </button>
    {/if}
  </div>
</div>
