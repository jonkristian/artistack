<script lang="ts">
  import type {
    Link,
    BandcampEmbedData,
    SpotifyEmbedData,
    RepoEmbedData,
    EmbedData
  } from '$lib/server/schema';
  import { toast } from '$lib/stores/toast.svelte';

  interface Props {
    link: Link | null;
    links: Link[];
    themeColors: {
      bg: string;
      card: string;
      accent: string;
    };
    onclose: () => void;
  }

  let { link, links, themeColors, onclose }: Props = $props();

  // Form state - common
  let label = $state('');
  let url = $state('');
  let embedEnabled = $state(true);

  // Bandcamp-specific state
  let embedSize = $state<'small' | 'large'>('large');
  let bgColor = $state('333333');
  let linkColor = $state('');
  let tracklist = $state(true);
  let artwork = $state<'small' | 'large' | 'none'>('small');

  // Spotify-specific state
  let spotifyTheme = $state<'dark' | 'light'>('dark');
  let spotifyCompact = $state(false);

  // Repo-specific state
  let repoDescription = $state('');
  let repoShowAvatar = $state(true);
  let repoDescriptionDisplay = $state<'truncate' | 'full'>('truncate');

  // Dialog ref
  let dialogEl: HTMLDialogElement;

  // Initialize form when link changes
  $effect(() => {
    if (link) {
      label = link.label || '';
      url = link.url;

      if (link.embedData) {
        embedEnabled = link.embedData.enabled !== false;

        if (link.embedData.platform === 'bandcamp') {
          const data = link.embedData as BandcampEmbedData;
          embedSize = data.size || 'large';
          bgColor = data.bgColor === 'ffffff' ? 'ffffff' : '333333';
          linkColor = data.linkColor || themeColors.accent;
          tracklist = data.tracklist !== false;
          artwork = data.artwork || 'small';
        } else if (link.embedData.platform === 'spotify') {
          const data = link.embedData as SpotifyEmbedData;
          spotifyTheme = data.theme || 'dark';
          spotifyCompact = data.compact || false;
        } else if (['github', 'gitlab', 'codeberg'].includes(link.embedData.platform)) {
          const data = link.embedData as RepoEmbedData;
          repoDescription = data.description || '';
          repoShowAvatar = data.showAvatar !== false;
          repoDescriptionDisplay = data.descriptionDisplay || 'truncate';
        }
      }

      dialogEl?.showModal();
    }
  });

  function handleClose() {
    dialogEl?.close();
    onclose();
  }

  function handleSave() {
    if (!link) return;

    // Update the link object directly (it's from the reactive array)
    link.label = label || null;
    link.url = url;

    if (link.embedData) {
      if (link.embedData.platform === 'bandcamp') {
        link.embedData = {
          ...(link.embedData as BandcampEmbedData),
          enabled: embedEnabled,
          size: embedSize,
          bgColor,
          linkColor,
          tracklist,
          artwork
        };
      } else if (link.embedData.platform === 'spotify') {
        link.embedData = {
          ...(link.embedData as SpotifyEmbedData),
          enabled: embedEnabled,
          theme: spotifyTheme,
          compact: spotifyCompact
        };
      } else if (link.embedData.platform === 'youtube') {
        link.embedData = {
          platform: 'youtube',
          id: link.embedData.id,
          enabled: embedEnabled
        } satisfies EmbedData;
      } else if (['github', 'gitlab', 'codeberg'].includes(link.embedData.platform)) {
        link.embedData = {
          ...(link.embedData as RepoEmbedData),
          enabled: embedEnabled,
          showAvatar: repoShowAvatar,
          descriptionDisplay: repoDescriptionDisplay,
          description: repoDescription || (link.embedData as RepoEmbedData).description
        };
      }
    }

    // Trigger array reactivity
    links.length = links.length;

    toast.info('Link updated');
    handleClose();
  }

  function handleDelete() {
    if (!link || !confirm('Delete this link?')) return;

    const index = links.findIndex((l) => l.id === link.id);
    if (index !== -1) {
      links.splice(index, 1);
      links.length = links.length;
    }

    toast.info('Link deleted');
    handleClose();
  }

  const isBandcamp = $derived(link?.embedData?.platform === 'bandcamp');
  const isSpotify = $derived(link?.embedData?.platform === 'spotify');
  const isYouTube = $derived(link?.embedData?.platform === 'youtube');
  const isRepo = $derived(
    ['github', 'gitlab', 'codeberg'].includes(link?.embedData?.platform ?? '')
  );
  const hasEmbed = $derived(!!link?.embedData);
</script>

<dialog
  bind:this={dialogEl}
  class="fixed inset-0 m-auto h-fit w-full max-w-md rounded-xl border border-gray-700 bg-gray-900 p-0 text-white backdrop:bg-black/60"
  onclose={handleClose}
>
  {#if link}
    <div class="p-6">
      <div class="mb-6 flex items-center justify-between">
        <h2 class="text-lg font-semibold">Edit Link</h2>
        <button
          onclick={handleClose}
          class="text-gray-400 hover:text-white"
          aria-label="Close dialog"
        >
          <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      <div class="space-y-4">
        <!-- Basic Info -->
        <div>
          <label for="link-label" class="mb-1 block text-sm text-gray-400">Label</label>
          <input
            id="link-label"
            type="text"
            bind:value={label}
            placeholder={link.platform.replace('_', ' ')}
            class="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-gray-600 focus:outline-none"
          />
        </div>

        <div>
          <label for="link-url" class="mb-1 block text-sm text-gray-400">URL</label>
          <input
            id="link-url"
            type="url"
            bind:value={url}
            class="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white focus:border-gray-600 focus:outline-none"
          />
        </div>

        <!-- Bandcamp Embed Options -->
        {#if isBandcamp && hasEmbed}
          <div class="border-t border-gray-700 pt-4">
            <h3 class="mb-3 text-sm font-medium text-gray-300">Embed Options</h3>

            <label class="mb-4 flex cursor-pointer items-center justify-between">
              <span class="text-sm text-gray-400">Show as player</span>
              <button
                type="button"
                role="switch"
                aria-checked={embedEnabled}
                aria-label="Show as player"
                onclick={() => (embedEnabled = !embedEnabled)}
                class="relative h-6 w-11 rounded-full transition-colors {embedEnabled
                  ? 'bg-violet-600'
                  : 'bg-gray-700'}"
              >
                <span
                  class="absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform {embedEnabled
                    ? 'translate-x-5'
                    : ''}"
                ></span>
              </button>
            </label>

            {#if embedEnabled}
              <div class="mb-4">
                <span class="mb-2 block text-sm text-gray-400">Player style</span>
                <div class="flex gap-2">
                  <button
                    type="button"
                    onclick={() => (embedSize = 'small')}
                    class="flex-1 rounded-lg px-3 py-2 text-sm transition-colors {embedSize ===
                    'small'
                      ? 'bg-violet-600 text-white'
                      : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}">Slim bar</button
                  >
                  <button
                    type="button"
                    onclick={() => (embedSize = 'large')}
                    class="flex-1 rounded-lg px-3 py-2 text-sm transition-colors {embedSize ===
                    'large'
                      ? 'bg-violet-600 text-white'
                      : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}">With artwork</button
                  >
                </div>
              </div>

              <div class="mb-4">
                <span class="mb-2 block text-sm text-gray-400">Player theme</span>
                <div class="flex gap-2">
                  <button
                    type="button"
                    onclick={() => (bgColor = 'ffffff')}
                    class="flex-1 rounded-lg px-3 py-2 text-sm transition-colors {bgColor ===
                    'ffffff'
                      ? 'bg-violet-600 text-white'
                      : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}">Light</button
                  >
                  <button
                    type="button"
                    onclick={() => (bgColor = '333333')}
                    class="flex-1 rounded-lg px-3 py-2 text-sm transition-colors {bgColor !==
                    'ffffff'
                      ? 'bg-violet-600 text-white'
                      : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}">Dark</button
                  >
                </div>
              </div>

              <div class="mb-4">
                <label for="link-color" class="mb-1 block text-sm text-gray-400">Accent color</label
                >
                <div class="flex items-center gap-2">
                  <input
                    id="link-color"
                    type="color"
                    bind:value={linkColor}
                    class="h-8 w-8 cursor-pointer rounded border-0 bg-transparent"
                  />
                  <input
                    type="text"
                    bind:value={linkColor}
                    class="w-full rounded border border-gray-700 bg-gray-800 px-2 py-1 text-xs text-white"
                  />
                </div>
              </div>

              {#if embedSize === 'large'}
                <div class="mb-4">
                  <span class="mb-2 block text-sm text-gray-400">Artwork size</span>
                  <div class="flex gap-2">
                    {#each ['small', 'large', 'none'] as artworkSize}
                      <button
                        type="button"
                        onclick={() => (artwork = artworkSize as 'small' | 'large' | 'none')}
                        class="flex-1 rounded-lg px-3 py-2 text-sm capitalize transition-colors {artwork ===
                        artworkSize
                          ? 'bg-violet-600 text-white'
                          : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}">{artworkSize}</button
                      >
                    {/each}
                  </div>
                </div>

                <label class="flex cursor-pointer items-center justify-between">
                  <span class="text-sm text-gray-400">Show tracklist</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={tracklist}
                    aria-label="Show tracklist"
                    onclick={() => (tracklist = !tracklist)}
                    class="relative h-6 w-11 rounded-full transition-colors {tracklist
                      ? 'bg-violet-600'
                      : 'bg-gray-700'}"
                  >
                    <span
                      class="absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform {tracklist
                        ? 'translate-x-5'
                        : ''}"
                    ></span>
                  </button>
                </label>
              {/if}
            {/if}
          </div>
        {/if}

        <!-- Spotify Embed Options -->
        {#if isSpotify && hasEmbed}
          <div class="border-t border-gray-700 pt-4">
            <h3 class="mb-3 text-sm font-medium text-gray-300">Embed Options</h3>

            <label class="mb-4 flex cursor-pointer items-center justify-between">
              <span class="text-sm text-gray-400">Show as player</span>
              <button
                type="button"
                role="switch"
                aria-checked={embedEnabled}
                aria-label="Show as player"
                onclick={() => (embedEnabled = !embedEnabled)}
                class="relative h-6 w-11 rounded-full transition-colors {embedEnabled
                  ? 'bg-violet-600'
                  : 'bg-gray-700'}"
              >
                <span
                  class="absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform {embedEnabled
                    ? 'translate-x-5'
                    : ''}"
                ></span>
              </button>
            </label>

            {#if embedEnabled}
              <div class="mb-4">
                <span class="mb-2 block text-sm text-gray-400">Player theme</span>
                <div class="flex gap-2">
                  <button
                    type="button"
                    onclick={() => (spotifyTheme = 'dark')}
                    class="flex-1 rounded-lg px-3 py-2 text-sm transition-colors {spotifyTheme ===
                    'dark'
                      ? 'bg-violet-600 text-white'
                      : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}">Dark</button
                  >
                  <button
                    type="button"
                    onclick={() => (spotifyTheme = 'light')}
                    class="flex-1 rounded-lg px-3 py-2 text-sm transition-colors {spotifyTheme ===
                    'light'
                      ? 'bg-violet-600 text-white'
                      : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}">Light</button
                  >
                </div>
              </div>

              <label class="flex cursor-pointer items-center justify-between">
                <span class="text-sm text-gray-400">Compact player</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={spotifyCompact}
                  aria-label="Compact player"
                  onclick={() => (spotifyCompact = !spotifyCompact)}
                  class="relative h-6 w-11 rounded-full transition-colors {spotifyCompact
                    ? 'bg-violet-600'
                    : 'bg-gray-700'}"
                >
                  <span
                    class="absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform {spotifyCompact
                      ? 'translate-x-5'
                      : ''}"
                  ></span>
                </button>
              </label>
            {/if}
          </div>
        {/if}

        <!-- YouTube Embed Options -->
        {#if isYouTube && hasEmbed}
          <div class="border-t border-gray-700 pt-4">
            <h3 class="mb-3 text-sm font-medium text-gray-300">Embed Options</h3>

            <label class="flex cursor-pointer items-center justify-between">
              <span class="text-sm text-gray-400">Show as player</span>
              <button
                type="button"
                role="switch"
                aria-checked={embedEnabled}
                aria-label="Show as player"
                onclick={() => (embedEnabled = !embedEnabled)}
                class="relative h-6 w-11 rounded-full transition-colors {embedEnabled
                  ? 'bg-violet-600'
                  : 'bg-gray-700'}"
              >
                <span
                  class="absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform {embedEnabled
                    ? 'translate-x-5'
                    : ''}"
                ></span>
              </button>
            </label>
          </div>
        {/if}

        <!-- Repo Embed Options -->
        {#if isRepo && hasEmbed}
          <div class="border-t border-gray-700 pt-4">
            <h3 class="mb-3 text-sm font-medium text-gray-300">Project Card</h3>

            <label class="mb-4 flex cursor-pointer items-center justify-between">
              <span class="text-sm text-gray-400">Show as project card</span>
              <button
                type="button"
                role="switch"
                aria-checked={embedEnabled}
                aria-label="Show as project card"
                onclick={() => (embedEnabled = !embedEnabled)}
                class="relative h-6 w-11 rounded-full transition-colors {embedEnabled
                  ? 'bg-violet-600'
                  : 'bg-gray-700'}"
              >
                <span
                  class="absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform {embedEnabled
                    ? 'translate-x-5'
                    : ''}"
                ></span>
              </button>
            </label>

            {#if embedEnabled}
              <label class="mb-4 flex cursor-pointer items-center justify-between">
                <span class="text-sm text-gray-400">Show avatar</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={repoShowAvatar}
                  aria-label="Show avatar"
                  onclick={() => (repoShowAvatar = !repoShowAvatar)}
                  class="relative h-6 w-11 rounded-full transition-colors {repoShowAvatar
                    ? 'bg-violet-600'
                    : 'bg-gray-700'}"
                >
                  <span
                    class="absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform {repoShowAvatar
                      ? 'translate-x-5'
                      : ''}"
                  ></span>
                </button>
              </label>

              <div class="mb-4">
                <span class="mb-2 block text-sm text-gray-400">Description</span>
                <div class="flex gap-2">
                  <button
                    type="button"
                    onclick={() => (repoDescriptionDisplay = 'truncate')}
                    class="flex-1 rounded-lg px-3 py-2 text-sm transition-colors {repoDescriptionDisplay ===
                    'truncate'
                      ? 'bg-violet-600 text-white'
                      : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}">Truncate</button
                  >
                  <button
                    type="button"
                    onclick={() => (repoDescriptionDisplay = 'full')}
                    class="flex-1 rounded-lg px-3 py-2 text-sm transition-colors {repoDescriptionDisplay ===
                    'full'
                      ? 'bg-violet-600 text-white'
                      : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}">Full</button
                  >
                </div>
              </div>

              <div>
                <label for="repo-description" class="mb-1 block text-sm text-gray-400"
                  >Description override</label
                >
                <textarea
                  id="repo-description"
                  bind:value={repoDescription}
                  rows="2"
                  placeholder="Uses fetched description if empty"
                  class="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-gray-600 focus:outline-none"
                ></textarea>
              </div>
            {/if}
          </div>
        {/if}
      </div>

      <!-- Actions -->
      <div class="mt-6 flex items-center justify-between border-t border-gray-700 pt-4">
        <button onclick={handleDelete} class="text-sm text-red-400 hover:text-red-300"
          >Delete link</button
        >
        <div class="flex gap-2">
          <button
            onclick={handleClose}
            class="rounded-lg bg-gray-800 px-4 py-2 text-sm font-medium text-gray-300 hover:bg-gray-700"
            >Cancel</button
          >
          <button
            onclick={handleSave}
            class="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500"
            >Apply</button
          >
        </div>
      </div>
    </div>
  {/if}
</dialog>
