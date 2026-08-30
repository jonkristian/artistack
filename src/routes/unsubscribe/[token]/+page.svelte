<script lang="ts">
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  const settings = $derived(data.settings);
</script>

<svelte:head>
  <title>Unsubscribed</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div
  class="flex min-h-screen items-center justify-center px-4"
  style="
    --color-bg: {settings?.colorBg ?? '#0c0a14'};
    --color-text: {settings?.colorText ?? '#f4f4f5'};
    --color-text-muted: {settings?.colorTextMuted ?? '#a1a1aa'};
    background-color: var(--color-bg);
    color: var(--color-text);
  "
>
  <main class="max-w-sm text-center">
    <h1 class="text-xl font-semibold">You're unsubscribed</h1>
    <p class="mt-2 text-sm" style="color: var(--color-text-muted)">
      {data.email} won't get any more email from us.
    </p>
    <a
      href="/"
      class="mt-6 inline-block text-sm underline underline-offset-4"
      style="color: var(--color-text-muted)"
    >
      Back to the site
    </a>
  </main>
</div>
