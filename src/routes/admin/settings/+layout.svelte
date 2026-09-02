<script lang="ts">
  import { page } from '$app/state';

  let { children }: { children: any } = $props();

  /*
   * Settings is one section with several pages rather than one long page:
   * Integrations alone is over a thousand lines, and merging them would make a
   * file nobody wants to open. The sub-nav is what makes them read as one
   * section despite being separate routes.
   *
   * Appearance is deliberately not here. It's a full-height editor with a live
   * preview, not a form, and it can't share this chrome without losing the
   * preview to it.
   */
  const items = [
    { href: '/admin/settings', label: 'General' },
    { href: '/admin/settings/integrations', label: 'Integrations' },
    { href: '/admin/settings/users', label: 'Users' }
  ];

  const currentPath = $derived(page.url.pathname);
</script>

<div class="min-h-screen bg-gray-950 p-[clamp(1rem,4vw,1.5rem)]">
  <nav class="mb-6 border-b border-gray-800">
    <ul class="-mb-px flex gap-1 overflow-x-auto">
      {#each items as item (item.href)}
        <li>
          <a
            href={item.href}
            class="block border-b-2 px-4 py-2.5 text-sm whitespace-nowrap transition-colors {currentPath ===
            item.href
              ? 'border-white text-white'
              : 'border-transparent text-gray-400 hover:border-gray-700 hover:text-white'}"
          >
            {item.label}
          </a>
        </li>
      {/each}
    </ul>
  </nav>

  {@render children()}
</div>
