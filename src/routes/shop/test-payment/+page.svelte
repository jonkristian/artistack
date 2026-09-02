<script lang="ts">
  import SiteBackground from '$lib/pages/SiteBackground.svelte';
  import { resolveTheme } from '$lib/themes';
  import { formatPrice } from '$lib/utils/price';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  const Layout = $derived(resolveTheme(data.settings?.layout));
  const locale = $derived(data.settings?.locale ?? 'nb-NO');
</script>

<svelte:head>
  <title>Test payment</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<SiteBackground settings={data.settings}>
  <Layout
    profile={data.profile}
    settings={data.settings}
    links={[]}
    shows={[]}
    blocks={[]}
    media={[]}
  >
    <div class="flex flex-col gap-6">
      <!-- Said plainly and first. Somebody will reach this page by accident one
           day, and it must not look like a real payment screen. -->
      <div
        class="rounded-xl px-4 py-3 text-sm"
        style="background-color: color-mix(in srgb, #f59e0b 18%, transparent); color: var(--color-text)"
      >
        <strong>This is a test checkout.</strong> No money moves and no card is asked for. The order,
        the stock and the receipt are real.
      </div>

      <section class="rounded-xl p-4" style="background-color: var(--color-card)">
        <p class="mb-3 text-xs tracking-wider uppercase" style="color: var(--color-text-muted)">
          Order {data.order.reference}
        </p>

        <ul class="flex flex-col gap-2">
          {#each data.items as item (item.id)}
            <li class="flex items-baseline justify-between gap-3 text-sm">
              <span class="min-w-0 truncate" style="color: var(--color-text)">
                {item.quantity} × {item.name}
              </span>
              <span class="shrink-0 tabular-nums" style="color: var(--color-text-muted)">
                {formatPrice(item.unitPrice * item.quantity, data.order.currency, locale)}
              </span>
            </li>
          {/each}
        </ul>

        <div
          class="mt-3 flex items-baseline justify-between border-t pt-3"
          style="border-color: color-mix(in srgb, var(--color-text-muted) 20%, transparent)"
        >
          <span class="font-medium" style="color: var(--color-text)">Total</span>
          <span class="font-medium tabular-nums" style="color: var(--color-text)">
            {formatPrice(data.order.amount, data.order.currency, locale)}
          </span>
        </div>
      </section>

      <!-- Both outcomes, because the one worth testing is the one where it
           doesn't work. A form post, so it survives without JavaScript and
           behaves like the real redirect. -->
      <form method="POST" class="flex flex-col gap-2">
        <input type="hidden" name="reference" value={data.order.reference} />
        <input type="hidden" name="returnUrl" value={data.returnUrl} />

        <button
          type="submit"
          name="outcome"
          value="paid"
          class="rounded-lg px-4 py-3 text-sm font-medium transition-opacity hover:opacity-90"
          style="background: var(--color-accent); color: var(--color-on-accent)"
        >
          Pretend it worked
        </button>
        <button
          type="submit"
          name="outcome"
          value="declined"
          class="rounded-lg px-4 py-3 text-sm transition-opacity hover:opacity-90"
          style="background-color: var(--color-card); color: var(--color-text-muted)"
        >
          Pretend it was declined
        </button>
      </form>
    </div>
  </Layout>
</SiteBackground>
