<script lang="ts">
  import { SectionCard } from '$lib/components/cards';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  const active = $derived(data.subscribers.filter((s) => !s.unsubscribedAt));

  function formatDate(date: Date | null): string {
    if (!date) return '—';
    // The site's language, not a fixed Norwegian: this screen was showing
    // Norwegian dates whatever had been chosen in Settings.
    return new Intl.DateTimeFormat(data.settings?.locale || 'nb-NO', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    }).format(new Date(date));
  }
</script>

<div class="min-h-screen bg-gray-950 p-[clamp(1rem,4vw,1.5rem)]">
  <header class="mb-6 flex flex-wrap items-center justify-between gap-3">
    <p class="text-sm text-gray-400">
      <span class="font-medium text-white">{active.length}</span>
      {active.length === 1 ? 'person' : 'people'}
      {#if data.subscribers.length !== active.length}
        <span class="text-gray-600">
          · {data.subscribers.length - active.length} unsubscribed
        </span>
      {/if}
    </p>

    {#if data.subscribers.length > 0}
      <a
        href="/admin/subscribers/export"
        download
        class="rounded-lg border border-gray-700 px-4 py-2 text-sm whitespace-nowrap text-gray-300 transition hover:border-gray-600 hover:text-white"
      >
        Export CSV
      </a>
    {/if}
  </header>

  {#if data.subscribers.length === 0}
    <div class="rounded-xl border border-dashed border-gray-800 p-10 text-center">
      <p class="text-sm text-gray-400">Nobody yet.</p>
      <p class="mt-1 text-xs text-gray-600">
        The sign-up form appears on your release pages while the fan list is switched on.
      </p>
    </div>
  {:else}
    <SectionCard>
      <div class="overflow-x-auto">
        <table class="w-full min-w-[34rem] border-collapse text-sm">
          <thead>
            <tr class="border-b border-gray-800 text-xs tracking-wider text-gray-500 uppercase">
              <th class="py-2 pr-4 text-left font-normal">Email</th>
              <th class="py-2 pr-4 text-left font-normal">From</th>
              <th class="py-2 pr-4 text-left font-normal">Signed up</th>
              <th class="py-2 text-left font-normal">Status</th>
            </tr>
          </thead>
          <tbody>
            {#each data.subscribers as subscriber (subscriber.id)}
              <tr class="border-b border-gray-800/60 last:border-0">
                <td class="py-2.5 pr-4 text-gray-200">{subscriber.email}</td>
                <td class="py-2.5 pr-4 font-mono text-xs text-gray-500">
                  {subscriber.source ? `/${subscriber.source}` : '—'}
                </td>
                <td class="py-2.5 pr-4 text-gray-400 tabular-nums">
                  {formatDate(subscriber.consentAt)}
                </td>
                <td class="py-2.5">
                  {#if subscriber.unsubscribedAt}
                    <span class="text-xs text-gray-600">
                      Unsubscribed {formatDate(subscriber.unsubscribedAt)}
                    </span>
                  {:else}
                    <span class="text-xs text-green-400">Subscribed</span>
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </SectionCard>
  {/if}
</div>
