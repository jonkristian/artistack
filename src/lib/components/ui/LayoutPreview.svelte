<script lang="ts">
  import type { Component } from 'svelte';
  import type {
    Profile,
    Settings,
    Link,
    Show,
    Block,
    Media,
    ProductWithTags,
    ReleaseSummary
  } from '$lib/server/schema';

  let {
    layout: Layout,
    profile,
    settings = null,
    links = [],
    shows = [],
    blocks = [],
    media = [],
    products = [],
    releases = []
  }: {
    layout: Component<{
      profile: Profile;
      settings?: Settings | null;
      links: Link[];
      shows: Show[];
      blocks?: Block[];
      media?: Media[];
      products?: ProductWithTags[];
      releases?: ReleaseSummary[];
    }>;
    profile: Partial<Profile> & { name: string };
    settings?: Partial<Settings> | null;
    links?: Link[];
    shows?: Show[];
    blocks?: Block[];
    media?: Media[];
    /** For a shop block, which draws the shop rather than owning a list. */
    products?: ProductWithTags[];
    /** For a releases block, which draws the records the same way. */
    releases?: ReleaseSummary[];
  } = $props();

  // Build a complete profile object with defaults for preview
  const previewProfile = $derived({
    id: 1,
    name: profile.name || 'Artist Name',
    bio: profile.bio ?? null,
    email: profile.email ?? null
  } as Profile);

  const previewSettings = $derived({
    id: 1,
    colorBg: settings?.colorBg ?? '#0c0a14',
    colorCard: settings?.colorCard ?? '#14101f',
    colorAccent: settings?.colorAccent ?? '#8b5cf6',
    colorText: settings?.colorText ?? '#f4f4f5',
    colorTextMuted: settings?.colorTextMuted ?? '#a1a1aa',
    colorIcon: settings?.colorIcon ?? '#a1a1aa',
    layout: settings?.layout ?? 'default',
    showShareButton: settings?.showShareButton ?? true,
    showPressKit: settings?.showPressKit ?? false,
    /*
     * Feature flags belong in the preview because blocks read them. A block
     * that hides itself when its feature is off — the sign-up form, the shop —
     * was hiding itself here too, so the preview showed an empty space where
     * the page would show the block.
     */
    subscribersEnabled: settings?.subscribersEnabled ?? false,
    shopEnabled: settings?.shopEnabled ?? false,
    releasesEnabled: settings?.releasesEnabled ?? false,
    /** Prices and dates are formatted with it; without it they read American. */
    locale: settings?.locale ?? 'nb-NO'
  } as Settings);
</script>

<div
  class="preview-container"
  style="
		--color-bg: {previewSettings.colorBg};
		--color-card: {previewSettings.colorCard};
		--color-accent: {previewSettings.colorAccent};
		--color-text: {previewSettings.colorText};
		--color-text-muted: {previewSettings.colorTextMuted};
		--color-icon: {previewSettings.colorIcon};
	"
>
  <Layout
    profile={previewProfile}
    settings={previewSettings}
    {links}
    {shows}
    {blocks}
    {media}
    {products}
    {releases}
  />
</div>

<style>
  .preview-container {
    min-height: 100%;
    background-color: var(--color-bg);
  }
</style>
