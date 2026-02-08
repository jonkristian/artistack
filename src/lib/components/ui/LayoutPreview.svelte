<script lang="ts">
  import type { Component } from 'svelte';
  import type { Profile, Settings, Link, TourDate, Block, Media } from '$lib/server/schema';

  let {
    layout: Layout,
    profile,
    settings = null,
    links = [],
    tourDates = [],
    blocks = [],
    media = []
  }: {
    layout: Component<{
      profile: Profile;
      settings?: Settings | null;
      links: Link[];
      tourDates: TourDate[];
      blocks?: Block[];
      media?: Media[];
    }>;
    profile: Partial<Profile> & { name: string };
    settings?: Partial<Settings> | null;
    links?: Link[];
    tourDates?: TourDate[];
    blocks?: Block[];
    media?: Media[];
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
    layout: settings?.layout ?? 'default',
    showShareButton: settings?.showShareButton ?? true,
    showPressKit: settings?.showPressKit ?? false
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
	"
>
  <Layout
    profile={previewProfile}
    settings={previewSettings}
    {links}
    {tourDates}
    {blocks}
    {media}
  />
</div>

<style>
  .preview-container {
    min-height: 100%;
    background-color: var(--color-bg);
  }
</style>
