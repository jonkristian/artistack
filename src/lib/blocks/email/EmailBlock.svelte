<script lang="ts">
  import type { Block, EmailBlockConfig, PublicSettings } from '$lib/server/schema';
  import { EmailCapture } from '$lib/components/ui';

  let { block, settings }: { block: Block; settings?: PublicSettings | null } = $props();

  const config = $derived((block.config as EmailBlockConfig) ?? {});
</script>

<!-- Hiding the block type from the picker only stops new ones being added; a
     block already on the page would keep rendering a form that posts into a
     404 once the fan list is switched off. -->
{#if settings?.subscribersEnabled}
  <!-- No `source`: EmailCapture falls back to the page it's on, which is right
       for a block that can sit on any of them. -->
  <EmailCapture
    heading={config.heading || undefined}
    blurb={config.blurb || undefined}
    surface="soft"
  />
{/if}
