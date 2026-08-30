<script lang="ts">
  import { page } from '$app/stores';
  import { authClient } from '$lib/auth-client';
  import { goto, invalidateAll } from '$app/navigation';
  import { onMount, tick, untrack } from 'svelte';
  import Toaster from '$lib/components/ui/Toaster.svelte';
  import { publish } from '$lib/stores/pendingChanges.svelte';
  import * as draft from '$lib/stores/pageDraft.svelte';
  import { registerPublishHandler } from '$lib/stores/pendingChanges.svelte';
  import { toast } from '$lib/stores/toast.svelte';
  import { editorPreview } from '$lib/stores/editorPreview.svelte';
  import { publishAllChanges, buildDraftFromServerData } from './publishDraft';
  import type { UnifiedDraftData } from './publishDraft';
  import type { Link } from '$lib/server/schema';
  import type { LayoutData } from './$types';

  let { children, data }: { children: any; data: LayoutData } = $props();

  // Initialize unified draft store once at layout creation
  untrack(() => {
    draft.initialize(buildDraftFromServerData(data));
  });

  const draftData = draft.getData<UnifiedDraftData>();

  // Register unified publish handler (once, at layout level)
  registerPublishHandler(async () => {
    await publishAllChanges(draftData);
    await invalidateAll();
    await tick();
    draft.initialize(buildDraftFromServerData(data));
  });

  // Use direct function calls in $derived for proper signal tracking
  const isDirty = $derived(draft.isDirty());

  /*
   * Per-section dirty indicators for nav dots.
   *
   * Links are shared: a link belongs either to a block on the artist page or to
   * a release, so the dot has to look at who owns the changed ones rather than
   * at the collection as a whole. Otherwise editing a Spotify URL on a release
   * lights up Dashboard.
   */
  const changedLinkOwners = $derived.by(() => {
    if (!draft.hasChanges('links')) return { block: false, release: false };

    const diff = draft.computeCollectionDiff<Link>('links');
    const snapshot = draft.getSnapshot<Link[]>('links') ?? [];
    const touched = [
      ...diff.added,
      ...diff.updated.map(({ id }) => snapshot.find((l) => l.id === id)),
      ...diff.deleted.map((id) => snapshot.find((l) => l.id === id))
    ].filter((l): l is Link => Boolean(l));

    return {
      block: touched.some((l) => l.releaseId == null),
      release: touched.some((l) => l.releaseId != null)
    };
  });

  const dashboardDirty = $derived(
    draft.hasChanges('profile') ||
      draft.hasChanges('blocks') ||
      draft.hasChanges('tourDates') ||
      changedLinkOwners.block
  );
  const appearanceDirty = $derived(draft.hasChanges('appearance'));
  const releasesDirty = $derived(draft.hasChanges('releases') || changedLinkOwners.release);

  // Local updating state for minimum spinner duration
  let isUpdating = $state(false);

  /**
   * The nav is a permanent rail on a wide screen and a drawer on a narrow one.
   * This is the one place a breakpoint is honest: those are different
   * behaviours, not a different size, and no amount of clamp() gets you from
   * one to the other. Everything else in the admin is fluid.
   */
  let navOpen = $state(false);

  const currentPath = $derived($page.url.pathname);

  // Navigating is the end of the drawer's job, so it closes itself rather than
  // making every link remember to.
  $effect(() => {
    currentPath;
    navOpen = false;
  });
  const artistName = $derived(data.profile?.name ?? 'Artist');
  const pageTitle = $derived(`Artistack - ${artistName}`);

  /**
   * `adminOnly` mirrors the redirect in each page's load function. Editors are
   * bounced back to the dashboard from these, so listing them is a dead end —
   * and the nav is the only place they'd learn the page exists at all.
   *
   * Clips is separate: it's opt-in for everyone, not a matter of role.
   */
  const navItems = $derived(
    [
      { href: '/admin', label: 'Dashboard', icon: 'home' },
      { href: '/admin/stats', label: 'Stats', icon: 'chart' },
      { href: '/admin/media', label: 'Media', icon: 'image' },
      ...(data.settings?.releasesEnabled
        ? [{ href: '/admin/releases', label: 'Releases', icon: 'disc' }]
        : []),
      ...(data.settings?.clipsEnabled
        ? [{ href: '/admin/clips', label: 'Clips', icon: 'film' }]
        : []),
      ...(data.settings?.subscribersEnabled
        ? [{ href: '/admin/subscribers', label: 'Audience', icon: 'mail' }]
        : []),
      { href: '/admin/appearance', label: 'Appearance', icon: 'palette', adminOnly: true },
      { href: '/admin/integrations', label: 'Integrations', icon: 'plug', adminOnly: true },
      { href: '/admin/users', label: 'Users', icon: 'users', adminOnly: true },
      { href: '/admin/settings', label: 'Settings', icon: 'settings', adminOnly: true }
    ].filter((item) => !item.adminOnly || data.user.role === 'admin')
  );

  /**
   * Where you are, for the narrow top bar. The nav carries this on a wide
   * screen, which is why the pages no longer print their own title — but with
   * the nav behind a hamburger, something has to say it.
   *
   * Nested routes report their section: a clip editor is still "Clips".
   */
  const pageLabel = $derived.by(() => {
    if (currentPath === '/admin') return null;
    if (currentPath.startsWith('/admin/profile')) return 'Profile';
    return (
      navItems.find((item) => item.href !== '/admin' && currentPath.startsWith(item.href))?.label ??
      null
    );
  });

  // Map nav hrefs to their dirty state
  function isNavDirty(href: string): boolean {
    if (href === '/admin') return dashboardDirty;
    if (href === '/admin/appearance') return appearanceDirty;
    if (href === '/admin/releases') return releasesDirty;
    return false;
  }

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
  <!-- Narrow-screen top bar: the way into the nav, where you are, and — on the
       two-pane pages — which pane you're looking at. One row, because a second
       bar holding two buttons costs a tenth of a phone screen. The title yields
       first, since the toggle is the only thing here you actually press. -->
  <header
    class="fixed inset-x-0 top-0 z-30 flex h-14 items-center gap-2 border-b border-gray-800 bg-gray-900 px-3 lg:hidden"
  >
    <button
      onclick={() => (navOpen = true)}
      aria-label="Open menu"
      aria-expanded={navOpen}
      class="shrink-0 rounded-lg p-2 text-gray-400 hover:bg-gray-800 hover:text-white"
    >
      <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M4 6h16M4 12h16M4 18h16"
        />
      </svg>
    </button>
    <span class="flex min-w-0 flex-1 items-baseline gap-1.5 font-semibold text-white">
      <span class="truncate">{artistName}</span>
      {#if pageLabel}
        <span class="shrink-0 font-normal text-gray-500">/ {pageLabel}</span>
      {/if}
    </span>

    {#if editorPreview.active}
      <div class="flex shrink-0 gap-0.5 rounded-lg bg-gray-800 p-0.5">
        {#each ['editor', 'preview'] as const as pane (pane)}
          <button
            onclick={() => editorPreview.show(pane)}
            class="rounded-md px-2.5 py-1 text-xs font-medium transition-colors {editorPreview.showing ===
            pane
              ? 'bg-violet-600 text-white'
              : 'text-gray-400 hover:text-white'}"
          >
            {pane === 'editor' ? 'Edit' : 'Preview'}
          </button>
        {/each}
      </div>
    {/if}
  </header>

  <!-- Publishing lives in the drawer on a wide screen, where the drawer is
       always open. On a phone that put it behind the hamburger: not only out of
       reach, but out of sight, so nothing told you there was anything to save.
       Down here rather than in the top bar because there's room for Undo beside
       it, and because it's where a thumb already is. Shown only when there is
       something to save, so it doubles as the unsaved-changes indicator. -->
  {#if isDirty}
    <div
      class="fixed bottom-4 left-4 z-40 flex items-center gap-1 rounded-xl border border-gray-700 bg-gray-900/95 p-1 shadow-2xl backdrop-blur-sm lg:hidden"
    >
      <button
        onclick={draft.undo}
        disabled={isUpdating}
        aria-label="Undo changes"
        title="Undo changes"
        class="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-800 hover:text-white disabled:opacity-40"
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
        disabled={isUpdating}
        class="flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-2 text-sm font-medium whitespace-nowrap text-white transition-colors hover:bg-violet-500 disabled:opacity-60"
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
        {:else}
          <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M5 13l4 4L19 7"
            />
          </svg>
        {/if}
        Update
      </button>
    </div>
  {/if}

  {#if navOpen}
    <!-- Scrim. Only mounted while open, so it can't swallow clicks the rest of
         the time — the mistake the date picker's backdrop made. -->
    <button
      aria-label="Close menu"
      class="fixed inset-0 z-40 bg-black/60 lg:hidden"
      onclick={() => (navOpen = false)}
    ></button>
  {/if}

  <!-- Sidebar -->
  <aside
    class="fixed top-0 left-0 z-50 flex h-screen w-56 flex-col border-r border-gray-800 bg-gray-900 transition-transform duration-200 lg:translate-x-0 {navOpen
      ? 'translate-x-0'
      : '-translate-x-full'}"
  >
    <!-- Artist Name. The link out sits with the name because that's what it
         opens — the site this admin belongs to. -->
    <div class="flex h-14 items-center gap-2 border-b border-gray-800 px-4">
      <span class="min-w-0 flex-1 truncate font-semibold text-white">{artistName}</span>
      <a
        href="/"
        target="_blank"
        rel="noreferrer"
        title="View site"
        aria-label="View site"
        class="shrink-0 rounded-md p-1.5 text-gray-500 transition-colors hover:bg-gray-800 hover:text-white"
      >
        <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="1.5"
            d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
          />
        </svg>
      </a>
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
              {:else if item.icon === 'mail'}
                <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="1.5"
                    d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                  />
                </svg>
              {:else if item.icon === 'disc'}
                <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="1.5"
                    d="M9 19V6l12-3v13M9 19a3 3 0 11-6 0 3 3 0 016 0zm12-3a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
              {:else if item.icon === 'film'}
                <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="1.5"
                    d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z"
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
              {#if isNavDirty(item.href)}
                <span class="h-2 w-2 rounded-full bg-purple-500"></span>
              {/if}
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
        onclick={draft.undo}
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
      <!-- Who you're signed in as, doubling as the way to change it. The name
           is the label because that's what identifies the row; "Your profile"
           would say less in the same space. -->
      <a
        href="/admin/profile"
        class="mb-1 flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-gray-800/50 {currentPath ===
        '/admin/profile'
          ? 'bg-gray-800 text-white'
          : 'text-gray-400 hover:text-white'}"
      >
        {#if data.user.image}
          <img src={data.user.image} alt="" class="h-5 w-5 shrink-0 rounded-full object-cover" />
        {:else}
          <span
            class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-700 text-[10px] font-medium text-gray-300"
          >
            {(data.user.name ?? '?').charAt(0).toUpperCase()}
          </span>
        {/if}
        <span class="truncate">{data.user.name}</span>
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

  <!-- Main Content. Padded past the top bar on narrow screens, past the rail
       on wide ones — never both, because only one exists at a time. -->
  <main class="min-w-0 flex-1 pt-14 lg:ml-56 lg:pt-0">
    {@render children()}
  </main>
</div>
