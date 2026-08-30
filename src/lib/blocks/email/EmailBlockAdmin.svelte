<script lang="ts">
  import type { Block, EmailBlockConfig } from '$lib/server/schema';
  import { fieldClass, labelClass } from '$lib/utils/classes';

  let { block }: { block: Block } = $props();

  const config = $derived((block.config as EmailBlockConfig) ?? {});

  function patch(changes: Partial<EmailBlockConfig>) {
    block.config = { ...config, ...changes };
  }
</script>

<div class="space-y-3">
  <div>
    <label class={labelClass} for="email-heading-{block.id}">Heading</label>
    <input
      id="email-heading-{block.id}"
      class={fieldClass}
      value={config.heading ?? ''}
      placeholder="Get the next one first"
      oninput={(e) => patch({ heading: e.currentTarget.value })}
    />
  </div>
  <div>
    <label class={labelClass} for="email-blurb-{block.id}">Supporting line</label>
    <input
      id="email-blurb-{block.id}"
      class={fieldClass}
      value={config.blurb ?? ''}
      placeholder="An email when there’s something new. Nothing else."
      oninput={(e) => patch({ blurb: e.currentTarget.value })}
    />
  </div>
  <p class="text-xs text-gray-500">
    Sign-ups land in Audience, each with a one-click unsubscribe link.
  </p>
</div>
