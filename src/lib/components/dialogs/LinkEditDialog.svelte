<script lang="ts">
  import { untrack } from 'svelte';
  import { fieldClass, labelClass } from '$lib/utils/classes';
  import { ToggleSwitch } from '$lib/components/ui';
  import type {
    Link,
    BandcampEmbedData,
    SpotifyEmbedData,
    RepoEmbedData,
    EmbedData
  } from '$lib/server/schema';

  export interface LinkValues {
    label: string | null;
    url: string;
    embedData: EmbedData | null;
  }

  interface Props {
    /** The link being edited. The parent mounts this only when open. */
    link: Link;
    themeColors: { bg: string; card: string; accent: string };
    onsave: (values: LinkValues) => void;
    ondelete: (id: number) => void;
    onclose: () => void;
  }

  let { link, themeColors, onsave, ondelete, onclose }: Props = $props();

  /*
   * Read once, in the script body rather than an $effect. An effect reading
   * these would be invalidated by handleSave() writing them, and would reopen
   * the dialog a microtask after close(); the parent remounts this component
   * per open, so there is no later value to react to.
   */
  const initial = untrack(() => link);
  const embed = initial.embedData;

  let label = $state(initial.label || '');
  let url = $state(initial.url);
  let embedEnabled = $state(embed ? embed.enabled !== false : true);

  const bandcamp = embed?.platform === 'bandcamp' ? (embed as BandcampEmbedData) : null;
  let embedSize = $state<'small' | 'large'>(bandcamp?.size || 'large');
  let bgColor = $state(bandcamp?.bgColor === 'ffffff' ? 'ffffff' : '333333');
  let linkColor = $state(bandcamp?.linkColor || untrack(() => themeColors).accent);
  let tracklist = $state(bandcamp?.tracklist !== false);
  let artwork = $state<'small' | 'large' | 'none'>(bandcamp?.artwork || 'small');

  const spotify = embed?.platform === 'spotify' ? (embed as SpotifyEmbedData) : null;
  let spotifyTheme = $state<'dark' | 'light'>(spotify?.theme || 'dark');
  let spotifyCompact = $state(spotify?.compact || false);

  const repo =
    embed && ['github', 'gitlab', 'codeberg'].includes(embed.platform)
      ? (embed as RepoEmbedData)
      : null;
  let repoDescription = $state(repo?.description || '');
  let repoShowAvatar = $state(repo?.showAvatar !== false);
  let repoDescriptionDisplay = $state<'truncate' | 'full'>(repo?.descriptionDisplay || 'truncate');

  let dialogEl: HTMLDialogElement;

  // Reads only the element ref, so it runs once on mount and never re-opens.
  $effect(() => {
    dialogEl?.showModal();
  });

  function handleClose() {
    dialogEl?.close();
  }

  function handleDialogClose() {
    onclose();
  }

  /** Rebuilds embedData from the form, preserving whatever the platform ignores. */
  function nextEmbedData(): EmbedData | null {
    if (!embed) return null;
    if (bandcamp) {
      return {
        ...bandcamp,
        enabled: embedEnabled,
        size: embedSize,
        bgColor,
        linkColor,
        tracklist,
        artwork
      };
    }
    if (spotify) {
      return { ...spotify, enabled: embedEnabled, theme: spotifyTheme, compact: spotifyCompact };
    }
    if (embed.platform === 'youtube') {
      return { platform: 'youtube', id: embed.id, enabled: embedEnabled } satisfies EmbedData;
    }
    if (repo) {
      return {
        ...repo,
        enabled: embedEnabled,
        showAvatar: repoShowAvatar,
        descriptionDisplay: repoDescriptionDisplay,
        description: repoDescription || repo.description
      };
    }
    return embed;
  }

  function handleSave() {
    onsave({ label: label || null, url, embedData: nextEmbedData() });
    handleClose();
  }

  function handleDelete() {
    if (!confirm('Delete this link?')) return;
    ondelete(initial.id);
    handleClose();
  }

  const isYouTube = embed?.platform === 'youtube';
</script>

<dialog
  bind:this={dialogEl}
  class="fixed inset-0 m-auto h-fit w-full max-w-md rounded-xl border border-gray-700 bg-gray-900 p-0 text-white backdrop:bg-black/60"
  onclose={handleDialogClose}
>
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
        <label for="link-label" class={labelClass}>Label</label>
        <input
          id="link-label"
          type="text"
          bind:value={label}
          placeholder={link.platform.replace('_', ' ')}
          class={fieldClass}
        />
      </div>

      <div>
        <label for="link-url" class={labelClass}>URL</label>
        <input id="link-url" type="url" bind:value={url} class={fieldClass} />
      </div>

      <!-- Bandcamp Embed Options -->
      {#if bandcamp}
        <div class="border-t border-gray-700 pt-4">
          <h3 class="mb-3 text-sm font-medium text-gray-300">Embed Options</h3>

          <label class="mb-4 flex cursor-pointer items-center justify-between">
            <span class="text-sm text-gray-400">Show as player</span>
            <ToggleSwitch bind:checked={embedEnabled} label="Show as player" size="md" hideLabel />
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
                  class="flex-1 rounded-lg px-3 py-2 text-sm transition-colors {bgColor === 'ffffff'
                    ? 'bg-violet-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}">Light</button
                >
                <button
                  type="button"
                  onclick={() => (bgColor = '333333')}
                  class="flex-1 rounded-lg px-3 py-2 text-sm transition-colors {bgColor !== 'ffffff'
                    ? 'bg-violet-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}">Dark</button
                >
              </div>
            </div>

            <div class="mb-4">
              <label for="link-color" class={labelClass}>Accent color</label>
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
                <ToggleSwitch bind:checked={tracklist} label="Show tracklist" size="md" hideLabel />
              </label>
            {/if}
          {/if}
        </div>
      {/if}

      <!-- Spotify Embed Options -->
      {#if spotify}
        <div class="border-t border-gray-700 pt-4">
          <h3 class="mb-3 text-sm font-medium text-gray-300">Embed Options</h3>

          <label class="mb-4 flex cursor-pointer items-center justify-between">
            <span class="text-sm text-gray-400">Show as player</span>
            <ToggleSwitch bind:checked={embedEnabled} label="Show as player" size="md" hideLabel />
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
              <ToggleSwitch
                bind:checked={spotifyCompact}
                label="Compact player"
                size="md"
                hideLabel
              />
            </label>
          {/if}
        </div>
      {/if}

      <!-- YouTube Embed Options -->
      {#if isYouTube}
        <div class="border-t border-gray-700 pt-4">
          <h3 class="mb-3 text-sm font-medium text-gray-300">Embed Options</h3>

          <label class="flex cursor-pointer items-center justify-between">
            <span class="text-sm text-gray-400">Show as player</span>
            <ToggleSwitch bind:checked={embedEnabled} label="Show as player" size="md" hideLabel />
          </label>
        </div>
      {/if}

      <!-- Repo Embed Options -->
      {#if repo}
        <div class="border-t border-gray-700 pt-4">
          <h3 class="mb-3 text-sm font-medium text-gray-300">Project Card</h3>

          <label class="mb-4 flex cursor-pointer items-center justify-between">
            <span class="text-sm text-gray-400">Show as project card</span>
            <ToggleSwitch
              bind:checked={embedEnabled}
              label="Show as project card"
              size="md"
              hideLabel
            />
          </label>

          {#if embedEnabled}
            <label class="mb-4 flex cursor-pointer items-center justify-between">
              <span class="text-sm text-gray-400">Show avatar</span>
              <ToggleSwitch bind:checked={repoShowAvatar} label="Show avatar" size="md" hideLabel />
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
              <label for="repo-description" class={labelClass}>Description override</label>
              <textarea
                id="repo-description"
                bind:value={repoDescription}
                rows="2"
                placeholder="Uses fetched description if empty"
                class={fieldClass}
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
</dialog>
