<script lang="ts">
  import { page } from '$app/state';
  import { autosaving } from '$lib/stores/autosaving.svelte';
  import { authClient } from '$lib/auth-client';
  import { goto, invalidateAll } from '$app/navigation';
  import { onMount, tick, untrack } from 'svelte';
  import Toaster from '$lib/components/ui/Toaster.svelte';
  import { publish } from '$lib/stores/pendingChanges.svelte';
  import * as draft from '$lib/stores/pageDraft.svelte';
  import { registerPublishHandler } from '$lib/stores/pendingChanges.svelte';
  import { toast } from '$lib/stores/toast.svelte';
  import { editorPreview } from '$lib/stores/editorPreview.svelte';

  /*
   * Dark or light, for this browser.
   *
   * Not a setting on the server: it is about the screen you are sitting at,
   * not about the site, and the same person on a laptop in the dark and a
   * desk in the sun wants different answers from the same account.
   *
   * Written onto `<html>` so the whole admin and anything it opens follows
   * one attribute. The public site is untouched — it paints from its own
   * palette and never names a grey from this ramp.
   */
  const THEME_KEY = 'artistack:admin-theme';
  let theme = $state<'dark' | 'light'>('dark');

  function setTheme(next: 'dark' | 'light') {
    theme = next;
    document.documentElement.dataset.theme = next;
    localStorage.setItem(THEME_KEY, next);
  }

  onMount(() => {
    const saved = localStorage.getItem(THEME_KEY);
    setTheme(saved === 'light' ? 'light' : 'dark');
    // Navigating out to the public site takes the preference off with it: the
    // site has a palette of its own and shouldn't wear the tool's.
    return () => delete document.documentElement.dataset.theme;
  });
  import { publishAllChanges, buildDraftFromServerData } from './publishDraft';
  import type { UnifiedDraftData } from './publishDraft';
  import type { Link, Block } from '$lib/server/schema';
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
   * Everything a page is made of resolves to the page it's on: a block says so
   * directly, and a link says which block it's on, so it resolves through that.
   * Without this, editing anything at all lit whichever section happened to own
   * the collection — the reason a Spotify URL on a release used to light up the
   * front page.
   *
   * Shows aren't here. They belong to the site rather than to a page, so they
   * light Shows wherever they're displayed.
   *
   * Compared per page as a whole rather than by walking the diff, because
   * reordering is a change to a page too, and a diff reports that as one flag
   * for the collection without saying which page moved.
   */
  const changedPageIds = $derived.by(() => {
    const snapBlocks = draft.getSnapshot<Block[]>('blocks') ?? [];
    const snapLinks = draft.getSnapshot<Link[]>('links') ?? [];

    const fingerprint = (blocks: Block[], links: Link[], pageId: number) => {
      const onPage = blocks.filter((b) => b.pageId === pageId);
      const blockIds = new Set(onPage.map((b) => b.id));
      return JSON.stringify([
        onPage,
        links.filter((l) => l.blockId != null && blockIds.has(l.blockId))
      ]);
    };

    // Both sides: a page can gain its first block or lose its last.
    const candidates = new Set<number>();
    for (const block of [...snapBlocks, ...draftData.blocks]) {
      if (block.pageId != null) candidates.add(block.pageId);
    }

    const changed = new Set<number>();
    for (const pageId of candidates) {
      if (
        fingerprint(snapBlocks, snapLinks, pageId) !==
        fingerprint(draftData.blocks, draftData.links, pageId)
      ) {
        changed.add(pageId);
      }
    }
    return changed;
  });

  const landingPageId = $derived(data.pages.find((p) => p.type === 'landing')?.id ?? null);
  const customPageIds = $derived(
    new Set(data.pages.filter((p) => p.type === 'custom').map((p) => p.id))
  );

  /*
   * The profile belongs to the front page: it's what the profile block shows,
   * and that block only exists there.
   */
  const homeDirty = $derived(
    draft.hasChanges('profile') || (landingPageId != null && changedPageIds.has(landingPageId))
  );
  const showsDirty = $derived(draft.hasChanges('shows'));
  const shopDirty = $derived(draft.hasChanges('products'));
  const pagesDirty = $derived([...changedPageIds].some((id) => customPageIds.has(id)));

  /*
   * A release's links hang off the release, not off a block, so they never
   * appear in a page's fingerprint and have to be counted separately.
   */
  const releaseLinksDirty = $derived.by(() => {
    if (!draft.hasChanges('links')) return false;

    const diff = draft.computeCollectionDiff<Link>('links');
    const snapshot = draft.getSnapshot<Link[]>('links') ?? [];
    const touched = [
      ...diff.added,
      ...diff.updated.map(({ id }) => snapshot.find((l) => l.id === id)),
      ...diff.deleted.map((id) => snapshot.find((l) => l.id === id))
    ].filter((l): l is Link => Boolean(l));

    return touched.some((l) => l.releaseId != null);
  });

  const appearanceDirty = $derived(draft.hasChanges('appearance'));
  const releasesDirty = $derived(draft.hasChanges('releases') || releaseLinksDirty);

  // Local updating state for minimum spinner duration
  let isUpdating = $state(false);

  /**
   * The nav is a permanent rail on a wide screen and a drawer on a narrow one.
   * This is the one place a breakpoint is honest: those are different
   * behaviours, not a different size, and no amount of clamp() gets you from
   * one to the other. Everything else in the admin is fluid.
   */
  let navOpen = $state(false);

  /**
   * The rail, narrowed to its icons.
   *
   * Width the editor can use: the clip studio's timeline measures the whole
   * clip across the page, and 56 pixels back is a few seconds more of it. Kept
   * in the browser because it's about the screen someone is sitting at, not
   * about the site — the same preference on a laptop and a monitor would be
   * the wrong one in one of the two places.
   *
   * Wide screens only. On a narrow one the rail is a drawer that opens over the
   * page and shuts again, so there is no room being taken to give back.
   */
  const NAV_SLIM_KEY = 'artistack:nav-slim';
  let navSlim = $state(false);

  // Reads nothing reactive, so it runs once, where localStorage exists.
  $effect(() => {
    navSlim = localStorage.getItem(NAV_SLIM_KEY) === '1';
  });

  $effect(() => {
    localStorage.setItem(NAV_SLIM_KEY, navSlim ? '1' : '0');
  });

  const currentPath = $derived(page.url.pathname);

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
   *
   * `group` splits the rail into three acts, separated by a rule: the
   * overview, the things you make, and the site itself. Stats sits in the last
   * of those rather than near the top — it's where you go for detail once the
   * dashboard has told you something is worth looking at.
   *
   * Within the middle act: the two that are always there lead, so the top of
   * the rail is in the same place on every site — order them the other way and
   * the second item is Releases here, Clips there, Media somewhere else. The
   * optional sections follow, and Pages comes last.
   *
   * Pages is off by default and last when it's on, because it's the remainder.
   * Home, releases and the shop are pages too, but each is either the only one
   * of its kind or a set worth its own section — which covers a music site
   * entirely. What's left is the occasional about or contact, and a site with
   * none of those shouldn't carry a section for them.
   */
  const navItems = $derived(
    [
      { href: '/admin', label: 'Dashboard', icon: 'schedule', group: 'overview' },
      { href: '/admin/home', label: 'Home', icon: 'home', group: 'make' },
      { href: '/admin/media', label: 'Media', icon: 'image', group: 'make' },
      ...(data.settings?.releasesEnabled
        ? [{ href: '/admin/releases', label: 'Releases', icon: 'disc', group: 'make' }]
        : []),
      ...(data.settings?.shopEnabled
        ? [
            {
              href: '/admin/shop',
              label: 'Shop',
              icon: 'bag',
              group: 'make',
              /*
               * Only shown while you're in the shop. Orders is the shop's other
               * half rather than a section of its own, and a rail that listed
               * every screen would be a sitemap.
               */
              children: [
                {
                  href: '/admin/shop/orders',
                  label: 'Orders',
                  icon: 'receipt',
                  count: data.ordersAwaitingPost ?? 0
                }
              ]
            }
          ]
        : []),
      ...(data.settings?.showsEnabled
        ? [{ href: '/admin/shows', label: 'Shows', icon: 'calendar', group: 'make' }]
        : []),
      ...(data.settings?.clipsEnabled
        ? [{ href: '/admin/clips', label: 'Clips', icon: 'film', group: 'make' }]
        : []),
      ...(data.settings?.subscribersEnabled
        ? [{ href: '/admin/subscribers', label: 'Audience', icon: 'mail', group: 'make' }]
        : []),
      ...(data.settings?.pagesEnabled
        ? [{ href: '/admin/pages', label: 'Pages', icon: 'document', group: 'make' }]
        : []),
      {
        href: '/admin/appearance',
        label: 'Appearance',
        icon: 'palette',
        group: 'site',
        adminOnly: true
      },
      { href: '/admin/stats', label: 'Stats', icon: 'chart', group: 'site' },
      {
        href: '/admin/settings',
        label: 'Settings',
        icon: 'settings',
        group: 'site',
        adminOnly: true
      }
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
    /*
     * Deepest first, so /admin/shop/orders reports "Orders" rather than "Shop".
     * A nested route still reports its section when it has no entry of its own
     * — a clip editor is "Clips".
     */
    const candidates = navItems.flatMap((item) => [item, ...(item.children ?? [])]);
    return (
      candidates
        .filter((item) => item.href !== '/admin' && currentPath.startsWith(item.href))
        .sort((a, b) => b.href.length - a.href.length)[0]?.label ?? null
    );
  });

  /**
   * A section stays lit while you're inside it, the same way `pageLabel` keeps
   * reporting the section from a nested route. Matching the path exactly would
   * unlight the whole rail the moment you opened a page or a release.
   *
   * `/admin` is exact on purpose — every path starts with it.
   */
  function isNavActive(href: string): boolean {
    return href === '/admin' ? currentPath === '/admin' : currentPath.startsWith(href);
  }

  // Map nav hrefs to their dirty state
  function isNavDirty(href: string): boolean {
    if (href === '/admin/home') return homeDirty;
    if (href === '/admin/shows') return showsDirty;
    if (href === '/admin/shop') return shopDirty;
    if (href === '/admin/pages') return pagesDirty;
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
      class="shrink-0 rounded-lg p-2 text-gray-400 hover:bg-gray-800 hover:text-gray-50"
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
    <span class="flex min-w-0 flex-1 items-baseline gap-1.5 font-semibold text-gray-50">
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
              : 'text-gray-400 hover:text-gray-50'}"
          >
            {pane === 'editor' ? 'Edit' : 'Preview'}
          </button>
        {/each}
      </div>
    {/if}

    <!-- The way out to the site, which on a wide screen sits in the drawer
         beside the name. On a phone the drawer is shut most of the time, so it
         lives here instead — the same link, where the name already is. -->
    <a
      href="/"
      target="_blank"
      rel="noreferrer"
      title="View site"
      aria-label="View site"
      class="shrink-0 rounded-md p-1.5 text-gray-500 transition-colors hover:bg-gray-800 hover:text-gray-50"
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
        class="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-800 hover:text-gray-50 disabled:opacity-40"
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
    class="fixed top-0 left-0 z-50 flex h-screen w-56 flex-col border-r border-gray-800 bg-gray-900 transition-all duration-200 lg:translate-x-0 {navSlim
      ? 'lg:w-14'
      : 'lg:w-56'} {navOpen ? 'translate-x-0' : '-translate-x-full'}"
  >
    <!-- Artist Name. The link out sits with the name because that's what it
         opens — the site this admin belongs to.

         Hidden below lg: the narrow-screen bar above the drawer already carries
         both, and a drawer that opens over it would say them twice. -->
    <div
      class="hidden h-14 items-center gap-2 border-b border-gray-800 lg:flex {navSlim
        ? 'justify-center px-0'
        : 'px-4'}"
    >
      {#if !navSlim}
        <span class="min-w-0 flex-1 truncate font-semibold text-gray-50">{artistName}</span>
      {/if}
      <a
        href="/"
        target="_blank"
        rel="noreferrer"
        title="View site"
        aria-label="View site"
        class="shrink-0 rounded-md p-1.5 text-gray-500 transition-colors hover:bg-gray-800 hover:text-gray-50 {navSlim
          ? 'lg:hidden'
          : ''}"
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
      <!-- The width switch. In the rail's own head rather than at its foot,
           because it is about the rail and that is where the rail starts. -->
      <button
        type="button"
        onclick={() => (navSlim = !navSlim)}
        title={navSlim ? 'Widen the menu' : 'Narrow the menu'}
        aria-label={navSlim ? 'Widen the menu' : 'Narrow the menu'}
        aria-pressed={navSlim}
        class="shrink-0 rounded-md p-1.5 text-gray-500 transition-colors hover:bg-gray-800 hover:text-gray-50"
      >
        <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="1.5"
            d={navSlim ? 'M13 5l7 7-7 7M5 5l7 7-7 7' : 'M11 19l-7-7 7-7M19 19l-7-7 7-7'}
          />
        </svg>
      </button>
    </div>

    <!-- Navigation.
         Extra room at the top below lg, where the header above it is hidden and
         the drawer opens over the bar: without it the first item sits against
         the very edge of the screen. -->
    <nav class="flex-1 p-3 pt-5 lg:pt-3">
      <ul class="space-y-1">
        {#each navItems as item, i (item.href)}
          {#if i > 0 && navItems[i - 1].group !== item.group}
            <li class="mt-3! mb-2 border-t border-gray-800" aria-hidden="true"></li>
          {/if}
          <li>
            <a
              href={item.href}
              title={item.label}
              class="flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors {navSlim
                ? 'lg:justify-center lg:px-0'
                : ''} {isNavActive(item.href)
                ? 'bg-gray-800 text-gray-50'
                : 'text-gray-400 hover:bg-gray-800/50 hover:text-gray-50'}"
            >
              {#if item.icon === 'grid'}
                <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="1.5"
                    d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
                  />
                </svg>
              {:else if item.icon === 'home'}
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
              {:else if item.icon === 'bag'}
                <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="1.5"
                    d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"
                  />
                </svg>
              {:else if item.icon === 'schedule'}
                <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="1.5"
                    d="M8 7V3m8 4V3M3 11h18M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                  <circle cx="8.5" cy="15" r="1" fill="currentColor" stroke="none" />
                  <circle cx="12" cy="15" r="1" fill="currentColor" stroke="none" />
                  <circle cx="15.5" cy="15" r="1" fill="currentColor" stroke="none" />
                </svg>
              {:else if item.icon === 'calendar'}
                <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="1.5"
                    d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
              {:else if item.icon === 'document'}
                <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="1.5"
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
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
              <span class={navSlim ? 'lg:hidden' : ''}>{item.label}</span>
              {#if isNavDirty(item.href)}
                <span class="h-2 w-2 rounded-full bg-purple-500"></span>
              {/if}
            </a>

            <!-- Indented under the parent, and only while you're in it. The
                 count is here rather than on a toolbar because a reserved
                 payment lapses if it's left, and this is the one place you see
                 it from anywhere in the admin. -->
            {#if item.children && isNavActive(item.href) && !navSlim}
              <!-- ml-2.5 is not arbitrary: it puts the branch's vertical
                   stroke at 22px, which is dead centre under the parent's icon.
                   A descender that starts anywhere else reads as an indent
                   rather than as a line coming down from something. -->
              <ul class="mt-1 ml-2.5 space-y-1">
                {#each item.children as child (child.href)}
                  <li>
                    <a
                      href={child.href}
                      class="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors {currentPath.startsWith(
                        child.href
                      )
                        ? 'bg-gray-800 text-gray-50'
                        : 'text-gray-400 hover:bg-gray-800/50 hover:text-gray-50'}"
                    >
                      <!-- The branch: down, then right. Dimmer than the row it
                           belongs to, because it says where this sits rather
                           than what it is, and it shouldn't compete with the
                           icon next to it. -->
                      <svg
                        class="h-4 w-4 shrink-0 text-gray-500"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="2"
                          d="M6 4v7a3 3 0 003 3h8m0 0l-3-3m3 3l-3 3"
                        />
                      </svg>

                      {#if child.icon === 'receipt'}
                        <!--
                          A receipt, not a parcel. The archive box glyph is 18%
                          wider than it is tall, so at this size it reads as
                          squashed next to a rail of upright icons — that's the
                          shape, not the drawing. This one is square, which sits
                          evenly beside the arrow, and it's what an order is
                          before it's anything you post.

                          Framed rather than a bare page, so it doesn't collide
                          with the document Pages already uses.
                        -->
                        <svg
                          class="h-4 w-4 shrink-0"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="1.5"
                            d="M9 8h6m-6 4h6m-6 4h3M5 3h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2z"
                          />
                        </svg>
                      {/if}

                      <span class="flex-1">{child.label}</span>

                      {#if child.count > 0}
                        <span class="text-xs text-amber-400">{child.count}</span>
                      {/if}
                    </a>
                  </li>
                {/each}
              </ul>
            {/if}
          </li>
        {/each}
      </ul>
    </nav>

    <!-- Toasts -->
    <Toaster />

    <!-- Dark or light, for the tool rather than the site.
         At the foot of the rail with the other things that are about this
         window and not about the clip or the page in it. -->
    <div class="px-3 pb-1 {navSlim ? 'lg:px-2' : ''}">
      <button
        type="button"
        onclick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
        title={theme === 'light' ? 'Switch to dark' : 'Switch to light'}
        aria-label={theme === 'light' ? 'Switch to dark' : 'Switch to light'}
        class="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-gray-400 transition-colors hover:bg-gray-800 hover:text-gray-50 {navSlim
          ? 'lg:justify-center lg:px-0'
          : ''}"
      >
        <svg
          class="h-4 w-4 shrink-0"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          viewBox="0 0 24 24"
        >
          {#if theme === 'light'}
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z"
            />
          {:else}
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z"
            />
          {/if}
        </svg>
        <span class={navSlim ? 'lg:hidden' : ''}>
          {theme === 'light' ? 'Dark' : 'Light'}
        </span>
      </button>
    </div>

    <!-- Update & Undo Buttons. Stacked and icon-only in the slim rail: a
         labelled button at full width overflowed it and sat out over the page.

         An editor that saves as it goes has nothing to publish, so it says
         what it is doing in the same place instead: one corner answering "is
         my work safe", whichever kind of editor you are in. -->
    {#if autosaving.now}
      <div class="flex flex-col gap-2 p-3 {navSlim ? 'lg:p-2' : ''}">
        <!-- An editor that saves as it goes has nothing to publish, but it can
             still have something to take back. Same corner, same pair of
             buttons as Undo and Update — one answers "is my work safe", the
             other "can I have that back" — so the two kinds of editor differ
             in what the buttons do and not in where they are. -->
        {#if autosaving.history}
          {@const h = autosaving.history}
          <div class="flex gap-2 {navSlim ? 'lg:flex-col' : ''}">
            <button
              onclick={() => h.undo()}
              disabled={!h.canUndo}
              title={h.undoLabel ? `Undo ${h.undoLabel}` : 'Nothing to undo'}
              aria-label="Undo"
              class="flex flex-1 items-center justify-center rounded-lg bg-gray-800 px-3 py-2 text-gray-400 transition-all duration-300 hover:text-gray-50 hover:brightness-90 disabled:cursor-not-allowed disabled:opacity-30"
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
              onclick={() => h.redo()}
              disabled={!h.canRedo}
              title={h.redoLabel ? `Redo ${h.redoLabel}` : 'Nothing to redo'}
              aria-label="Redo"
              class="flex flex-1 items-center justify-center rounded-lg bg-gray-800 px-3 py-2 text-gray-400 transition-all duration-300 hover:text-gray-50 hover:brightness-90 disabled:cursor-not-allowed disabled:opacity-30"
            >
              <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M20 7H9a4 4 0 1 0 0 8h1m10-8l-3-3m3 3l-3 3"
                />
              </svg>
            </button>
          </div>
        {/if}
        <div
          class="flex items-center gap-2 rounded-lg bg-gray-800/60 px-3 py-2 text-xs {navSlim
            ? 'lg:justify-center lg:px-0'
            : ''}"
          title={autosaving.failure
            ? `Couldn't save ${autosaving.failure.what}`
            : autosaving.saving
              ? 'Saving'
              : 'Saved as you go'}
        >
          {#if autosaving.failure}
            <span class="h-2 w-2 shrink-0 rounded-full bg-red-400"></span>
            <span class={navSlim ? 'lg:hidden' : ''}>
              Couldn't save {autosaving.failure.what}
            </span>
          {:else if autosaving.saving}
            <svg
              class="h-3.5 w-3.5 shrink-0 animate-spin text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                class="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                stroke-width="4"
              ></circle>
              <path
                class="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              ></path>
            </svg>
            <span class="text-gray-400 {navSlim ? 'lg:hidden' : ''}">Saving…</span>
          {:else}
            <span class="h-2 w-2 shrink-0 rounded-full bg-emerald-500/70"></span>
            <span class="text-gray-500 {navSlim ? 'lg:hidden' : ''}">Saved as you go</span>
          {/if}
        </div>
      </div>
    {:else}
      <div class="flex gap-2 p-3 {navSlim ? 'lg:flex-col lg:p-2' : ''}">
        <button
          onclick={draft.undo}
          disabled={!isDirty || isUpdating}
          class="flex items-center justify-center rounded-lg bg-gray-800 px-3 py-2 text-gray-400 transition-all duration-300 hover:text-gray-50 hover:brightness-90 disabled:cursor-not-allowed disabled:opacity-30"
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
          title="Update"
          class="flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-white transition-all duration-300 disabled:cursor-not-allowed {navSlim
            ? 'lg:flex-none lg:px-0'
            : ''} {isDirty && !isUpdating ? 'bg-purple-600 hover:bg-purple-700' : 'bg-gray-800'}"
        >
          {#if isUpdating}
            <svg class="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle
                class="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                stroke-width="4"
              ></circle>
              <path
                class="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              ></path>
            </svg>
            <span class={navSlim ? 'lg:hidden' : ''}>Updating...</span>
          {:else}
            <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M5 13l4 4L19 7"
              />
            </svg>
            <span class={navSlim ? 'lg:hidden' : ''}>Update</span>
          {/if}
        </button>
      </div>
    {/if}

    <!-- Bottom Actions -->
    <div class="border-t border-gray-800 p-3">
      <!-- Who you're signed in as, doubling as the way to change it. The name
           is the label because that's what identifies the row; "Your profile"
           would say less in the same space. -->
      <a
        href="/admin/profile"
        title={data.user.name ?? 'Your profile'}
        class="mb-1 flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-gray-800/50 {navSlim
          ? 'lg:justify-center lg:px-0'
          : ''} {currentPath === '/admin/profile'
          ? 'bg-gray-800 text-gray-50'
          : 'text-gray-400 hover:text-gray-50'}"
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
        <span class="truncate {navSlim ? 'lg:hidden' : ''}">{data.user.name}</span>
      </a>
      <button
        onclick={signOut}
        title="Sign Out"
        class="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-gray-400 transition-colors hover:bg-gray-800/50 hover:text-gray-50 {navSlim
          ? 'lg:justify-center lg:px-0'
          : ''}"
      >
        <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="1.5"
            d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
          />
        </svg>
        <span class={navSlim ? 'lg:hidden' : ''}>Sign Out</span>
      </button>
    </div>
  </aside>

  <!-- Main Content. Padded past the top bar on narrow screens, past the rail
       on wide ones — never both, because only one exists at a time. -->
  <main class="min-w-0 flex-1 pt-14 lg:pt-0 {navSlim ? 'lg:ml-14' : 'lg:ml-56'}">
    {@render children()}
  </main>
</div>
