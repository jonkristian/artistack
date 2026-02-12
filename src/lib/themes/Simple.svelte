<script lang="ts">
  import type { Profile, Settings, Link, TourDate, Media, Block, BaseBlockConfig } from '$lib/server/schema';
  import { blockRegistry } from '$lib/blocks';
  import { shareProfile, spacingTopClasses, spacingBottomClasses } from '$lib/blocks/utils';

  let {
    profile,
    settings = null,
    links,
    tourDates,
    blocks = [],
    media = []
  }: {
    profile: Profile;
    settings?: Settings | null;
    links: Link[];
    tourDates: TourDate[];
    blocks?: Block[];
    media?: Media[];
  } = $props();

  const locale = $derived(settings?.locale || 'nb-NO');

  let showCopiedToast = $state(false);

  function share() {
    shareProfile(profile, () => {
      showCopiedToast = true;
      setTimeout(() => (showCopiedToast = false), 2000);
    });
  }

  const visibleBlocks = $derived(
    blocks.filter((b) => b.visible !== false).sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
  );
</script>

<main
  class="flex min-h-screen justify-center px-4 py-12 sm:py-20"
  style="background-color: var(--color-bg)"
>
  <div class="w-full max-w-xl">
    {#each visibleBlocks as block (block.id)}
      {@const def = blockRegistry[block.type]}
      {@const cfg = (block.config as BaseBlockConfig) ?? {}}
      {#if def}
        {@const BlockComponent = def.component}
        <div class="{spacingTopClasses[cfg.marginTop ?? 'none']} {spacingBottomClasses[cfg.marginBottom ?? 'medium']}">
          <BlockComponent {block} {profile} {settings} {links} {tourDates} {media} {locale} />
        </div>
      {/if}
    {/each}

    {#if settings?.showShareButton !== false}
      <section class="mt-8 flex justify-center">
        <button
          onclick={share}
          class="flex cursor-pointer items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium opacity-50 transition-opacity hover:opacity-80 active:scale-95"
          style="color: var(--color-text-muted)"
        >
          <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
            />
          </svg>
          Share
        </button>
      </section>
    {/if}

    {#if settings?.showPressKit}
      <section class="mt-8 flex justify-center">
        <a
          href="/uploads/press-kit.zip"
          download="press-kit.zip"
          class="inline-flex items-center gap-2 text-sm opacity-50 transition-opacity hover:opacity-80"
          style="color: var(--color-text-muted)"
        >
          <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
            />
          </svg>
          Press Kit
        </a>
      </section>
    {/if}
  </div>

  {#if showCopiedToast}
    <div
      class="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-full bg-gray-900 px-4 py-2 text-sm font-medium text-white shadow-lg"
      style="animation: fadeInUp 0.2s ease-out"
    >
      Link copied to clipboard
    </div>
  {/if}
</main>

<style>
  @keyframes fadeInUp {
    from {
      opacity: 0;
      transform: translate(-50%, 10px);
    }
    to {
      opacity: 1;
      transform: translate(-50%, 0);
    }
  }
</style>
