<script lang="ts">
  import type {
    Block,
    Profile,
    Link,
    TourDate,
    Media,
    ProfileBlockConfig
  } from '$lib/server/schema';
  import { socialIcons } from '$lib/blocks/utils';

  let {
    block,
    profile,
    links,
    tourDates,
    media,
    locale
  }: {
    block: Block;
    profile: Profile;
    links: Link[];
    tourDates: TourDate[];
    media: Media[];
    locale: string;
  } = $props();

  const config = $derived((block.config as ProfileBlockConfig) ?? {});
  const showName = $derived(config.showName !== false);
  const showBio = $derived(config.showBio !== false);

  // Social links for the profile header
  const socialLinks = $derived(links.filter((l) => l.category === 'social'));

  // Email obfuscation - encode email to prevent bot scraping
  const obfuscatedEmail = $derived(profile.email ? btoa(profile.email) : null);

  function handleEmailClick(e: MouseEvent) {
    if (!obfuscatedEmail) return;
    e.preventDefault();
    const email = atob(obfuscatedEmail);
    window.location.href = `mailto:${email}`;
  }
</script>

<!-- Hero Section -->
<header class="relative mb-10 text-center">
  <div class="relative mt-4 mb-8">
    {#if showName}
      <h1 class="text-2xl font-bold tracking-tight sm:text-3xl" style="color: var(--color-text)">
        {profile.name}
      </h1>
    {/if}

    {#if showBio && profile.bio}
      <p
        class="mx-auto max-w-md px-2 text-base leading-relaxed {showName ? 'mt-3' : 'mt-6'}"
        style="color: var(--color-text-muted)"
      >
        {profile.bio}
      </p>
    {/if}
  </div>

  <!-- Social Icons -->
  {#if socialLinks.length > 0 || profile.email}
    <div class="flex justify-center gap-3">
      {#if profile.email}
        <a
          href="#contact"
          onclick={handleEmailClick}
          class="flex h-9 w-9 items-center justify-center transition-all hover:scale-110"
          style="color: var(--color-text-muted)"
          title="{profile.name} - Email"
        >
          <svg viewBox="0 0 24 24" class="h-5 w-5 fill-current">
            <path d={socialIcons.email} />
          </svg>
        </a>
      {/if}
      {#each socialLinks as link (link.id)}
        <a
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          class="flex h-9 w-9 items-center justify-center transition-all hover:scale-110"
          style="color: var(--color-text-muted)"
          title="{profile.name} - {link.platform.charAt(0).toUpperCase() + link.platform.slice(1)}"
        >
          {#if socialIcons[link.platform]}
            <svg viewBox="0 0 24 24" class="h-5 w-5 fill-current">
              <path d={socialIcons[link.platform]} />
            </svg>
          {:else}
            <span class="text-sm font-bold">
              {link.platform.charAt(0).toUpperCase()}
            </span>
          {/if}
        </a>
      {/each}
    </div>
  {/if}
</header>
