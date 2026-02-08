<script lang="ts">
  import type { RepoEmbedData } from '$lib/server/schema';
  import { platformIcons } from '$lib/utils/platforms';
  import { trackClick } from '$lib/blocks/utils';

  interface Props {
    linkId: number;
    label: string | null;
    url: string;
    embedData: RepoEmbedData;
  }

  let { linkId, label, url, embedData }: Props = $props();

  const displayName = $derived(label || embedData.id?.split('/')[1] || 'Repository');
  const platformIcon = $derived(platformIcons[embedData.platform] ?? null);

  const languageColors: Record<string, string> = {
    TypeScript: '#3178c6',
    JavaScript: '#f1e05a',
    Python: '#3572A5',
    Rust: '#dea584',
    Go: '#00ADD8',
    Svelte: '#ff3e00',
    Vue: '#41b883',
    React: '#61dafb',
    Java: '#b07219',
    'C#': '#178600',
    'C++': '#f34b7d',
    C: '#555555',
    Ruby: '#701516',
    PHP: '#4F5D95',
    Swift: '#F05138',
    Kotlin: '#A97BFF',
    Dart: '#00B4AB',
    Shell: '#89e051',
    HTML: '#e34c26',
    CSS: '#563d7c',
    Lua: '#000080',
    Zig: '#ec915c',
    Elixir: '#6e4a7e',
    Haskell: '#5e5086',
    Scala: '#c22d40',
    Clojure: '#db5855',
    OCaml: '#3be133',
    Nix: '#7e7eff'
  };

  function formatCount(n: number): string {
    if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
    return String(n);
  }
</script>

<a
  href={url}
  target="_blank"
  rel="noopener noreferrer"
  onclick={() => trackClick(linkId)}
  class="group relative flex h-full flex-col overflow-hidden rounded-xl bg-white/5 p-3 transition-all hover:bg-white/10 active:scale-[0.98]"
>
  {#if platformIcon}
    <svg viewBox="0 0 24 24" class="absolute top-3 right-3 h-4 w-4" style="fill: var(--color-icon)">
      <path d={platformIcon} />
    </svg>
  {/if}
  <div class="flex items-center gap-2.5">
    {#if embedData.showAvatar !== false && embedData.avatarUrl}
      <img
        src={embedData.avatarUrl}
        alt={displayName}
        loading="lazy"
        class="h-8 w-8 flex-shrink-0 rounded-lg"
      />
    {/if}
    <div class="min-w-0 flex-1 pr-5">
      <p class="truncate text-sm font-semibold" style="color: var(--color-text)">
        {displayName}
      </p>
      <div class="flex items-center gap-2 text-xs" style="color: var(--color-text-muted)">
        {#if embedData.language}
          <span class="flex items-center gap-1">
            <span
              class="inline-block h-2 w-2 rounded-full"
              style="background-color: {languageColors[embedData.language] || '#8b8b8b'}"
            ></span>
            {embedData.language}
          </span>
        {/if}
        {#if embedData.stars != null && embedData.stars > 0}
          <span class="flex items-center gap-0.5">
            <svg class="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.562.562 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.562.562 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"
              />
            </svg>
            {formatCount(embedData.stars)}
          </span>
        {/if}
        {#if embedData.forks != null && embedData.forks > 0}
          <span class="flex items-center gap-0.5">
            <svg class="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0-12.814a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0 12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z"
              />
            </svg>
            {formatCount(embedData.forks)}
          </span>
        {/if}
      </div>
    </div>
  </div>

  {#if embedData.description}
    <p
      class="mt-2 text-xs leading-relaxed {embedData.descriptionDisplay === 'full' ? '' : 'line-clamp-2'}"
      style="color: var(--color-text-muted)"
      title={embedData.description}
    >
      {embedData.description}
    </p>
  {/if}
</a>
