<script lang="ts">
  import { page } from '$app/stores';
  import { authClient } from '$lib/auth-client';
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import Toaster from '$lib/components/ui/Toaster.svelte';
  import { publish } from '$lib/stores/pendingChanges.svelte';
  import { isDirty as checkDirty, undo } from '$lib/stores/pageDraft.svelte';
  import { toast } from '$lib/stores/toast.svelte';
  import type { LayoutData } from './$types';

  let { children, data }: { children: any; data: LayoutData } = $props();

  // Use direct function calls in $derived for proper signal tracking
  const isDirty = $derived(checkDirty());

  // Local updating state for minimum spinner duration
  let isUpdating = $state(false);

  const currentPath = $derived($page.url.pathname);
  const artistName = $derived(data.profile?.name ?? 'Artist');
  const pageTitle = $derived(`Artistack - ${artistName}`);

  const navItems = [
    { href: '/admin', label: 'Dashboard', icon: 'home' },
    { href: '/admin/stats', label: 'Stats', icon: 'chart' },
    { href: '/admin/media', label: 'Media', icon: 'image' },
    { href: '/admin/appearance', label: 'Appearance', icon: 'palette' },
    { href: '/admin/integrations', label: 'Integrations', icon: 'plug' },
    { href: '/admin/users', label: 'Users', icon: 'users' },
    { href: '/admin/settings', label: 'Settings', icon: 'settings' }
  ];

  onMount(() => {
    // Warn user about unsaved changes on page leave
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      if (isDirty) {
        e.preventDefault();
        return '';
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload);

    // Keyboard shortcut: Ctrl+S to publish
    function handleKeydown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (isDirty) handlePublish();
      }
    }
    window.addEventListener('keydown', handleKeydown);

    return () => {
      window.removeEventListener('keydown', handleKeydown);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  });

  async function signOut() {
    await authClient.signOut();
    goto('/');
  }

  async function handlePublish() {
    isUpdating = true;
    const minDelay = new Promise((resolve) => setTimeout(resolve, 600));
    try {
      await Promise.all([publish(), minDelay]);
    } catch (e) {
      console.error('Update failed:', e);
      toast.error('Failed to update');
    } finally {
      isUpdating = false;
    }
  }
</script>

<svelte:head>
  <title>{pageTitle}</title>
</svelte:head>

<div class="flex min-h-screen">
  <!-- Sidebar -->
  <aside
    class="fixed top-0 left-0 flex h-screen w-56 flex-col border-r border-gray-800 bg-gray-900"
  >
    <!-- Artist Name -->
    <div class="flex h-14 items-center gap-3 border-b border-gray-800 px-4">
      <span class="truncate font-semibold text-white">{artistName}</span>
    </div>

    <!-- Navigation -->
    <nav class="flex-1 p-3">
      <ul class="space-y-1">
        {#each navItems as item (item.href)}
          <li>
            <a
              href={item.href}
              class="flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors {currentPath ===
              item.href
                ? 'bg-gray-800 text-white'
                : 'text-gray-400 hover:bg-gray-800/50 hover:text-white'}"
            >
              {#if item.icon === 'home'}
                <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="1.5"
                    d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
                  />
                </svg>
              {:else if item.icon === 'chart'}
                <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="1.5"
                    d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                  />
                </svg>
              {:else if item.icon === 'image'}
                <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="1.5"
                    d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
              {:else if item.icon === 'palette'}
                <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="1.5"
                    d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01"
                  />
                </svg>
              {:else if item.icon === 'plug'}
                <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="1.5"
                    d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
                  />
                </svg>
              {:else if item.icon === 'users'}
                <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="1.5"
                    d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
                  />
                </svg>
              {:else if item.icon === 'settings'}
                <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="1.5"
                    d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                  />
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="1.5"
                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
              {/if}
              {item.label}
            </a>
          </li>
        {/each}
      </ul>
    </nav>

    <!-- Toasts -->
    <Toaster />

    <!-- Update & Undo Buttons -->
    <div class="flex gap-2 p-3">
      <button
        onclick={undo}
        disabled={!isDirty || isUpdating}
        class="flex items-center justify-center rounded-lg bg-gray-800 px-3 py-2 text-gray-400 transition-all duration-300 hover:text-white hover:brightness-90 disabled:cursor-not-allowed disabled:opacity-30"
        title="Undo changes"
      >
        <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M4 7h11a4 4 0 1 1 0 8h-1M4 7l3-3M4 7l3 3"
          />
        </svg>
      </button>
      <button
        onclick={handlePublish}
        disabled={isUpdating || !isDirty}
        class="flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-white transition-all duration-300 disabled:cursor-not-allowed {isDirty &&
        !isUpdating
          ? 'bg-purple-600 hover:bg-purple-700'
          : 'bg-gray-800'}"
      >
        {#if isUpdating}
          <svg class="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"
            ></circle>
            <path
              class="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            ></path>
          </svg>
          Updating...
        {:else}
          <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M5 13l4 4L19 7"
            />
          </svg>
          Update
        {/if}
      </button>
    </div>

    <!-- Bottom Actions -->
    <div class="border-t border-gray-800 p-3">
      <a
        href="/"
        class="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-gray-400 transition-colors hover:bg-gray-800/50 hover:text-white"
      >
        <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="1.5"
            d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
          />
        </svg>
        View Site
      </a>
      <button
        onclick={signOut}
        class="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-gray-400 transition-colors hover:bg-gray-800/50 hover:text-white"
      >
        <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="1.5"
            d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
          />
        </svg>
        Sign Out
      </button>
    </div>
  </aside>

  <!-- Main Content -->
  <main class="ml-56 flex-1">
    {@render children()}
  </main>
</div>
