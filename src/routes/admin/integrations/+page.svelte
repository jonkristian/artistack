<script lang="ts">
  import { fieldClass, labelClass } from '$lib/utils/classes';
  import type { PageData } from './$types';
  import {
    updateSpotifyConfig,
    saveGoogleConfig,
    updateDiscordSettings,
    updatePublishSettings,
    testDiscordWebhook
  } from './data.remote';
  import { updateSettings } from '../settings/data.remote';
  import { invalidateAll } from '$app/navigation';
  import { untrack } from 'svelte';
  import { ToggleSwitch } from '$lib/components/ui';

  let { data }: { data: PageData } = $props();

  /*
   * Seeded once from the load. These used to be filled by an $effect that ran
   * on every data change, so an invalidateAll anywhere on the page overwrote a
   * half-typed key with the stored value.
   */
  let spotifyClientId = $state(untrack(() => data.spotifyConfig?.clientId ?? ''));
  let spotifyClientSecret = $state(untrack(() => data.spotifyConfig?.clientSecret ?? ''));

  // Google settings state (unified for Places + YouTube)
  let googleApiKey = $state(untrack(() => data.googleConfig?.apiKey ?? ''));
  let googlePlacesEnabled = $state(untrack(() => data.googleConfig?.placesEnabled ?? true));
  let googleYoutubeEnabled = $state(untrack(() => data.googleConfig?.youtubeEnabled ?? true));

  // Discord settings state
  let discordWebhookUrl = $state('');
  let clipReviewWebhookUrl = $state('');
  let clipPublishedWebhookUrl = $state('');
  let discordEnabled = $state(false);
  let discordSchedule = $state<'daily' | 'weekly' | 'monthly'>('weekly');
  let discordScheduleDay = $state(1);
  let discordScheduleTime = $state('09:00');

  // Clip publishing state
  let publishWebhookUrl = $state('');
  let publishEnabled = $state(false);
  let publishIntervalDays = $state(3);
  let publishHour = $state(10);
  let publishSecret = $state('');

  /**
   * Shown rather than masked once generated: it has to be copied into whatever
   * receives the webhook, and a secret you can't read is a secret you'll
   * regenerate. 32 bytes of CSPRNG output, url-safe so it survives being pasted
   * into a header or an env var.
   */
  function generatePublishSecret() {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    publishSecret = btoa(String.fromCharCode(...bytes))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }
  let savingPublish = $state(false);
  let publishResult = $state<{ success: boolean; message: string } | null>(null);

  // Artist features state
  let pressKitEnabled = $state(false);
  let clipsEnabled = $state(false);
  let releasesEnabled = $state(false);
  let subscribersEnabled = $state(false);
  let pixelsEnabled = $state(false);
  let metaPixelId = $state('');
  let metaCapiToken = $state('');
  let tiktokPixelId = $state('');
  let savingPixels = $state(false);
  let pixelResult = $state<{ success: boolean; message: string } | null>(null);

  // UI state
  let savingSpotify = $state(false);
  let spotifyResult = $state<{ success: boolean; message: string } | null>(null);
  let savingGoogle = $state(false);
  let googleResult = $state<{ success: boolean; message: string } | null>(null);
  let savingDiscord = $state(false);
  let testingWebhook = $state(false);
  let discordResult = $state<{ success: boolean; message: string } | null>(null);

  // Derived: check if IDs are detected from links
  let spotifyDetectedId = $derived(data.detectedIds?.spotify?.artistId);
  let youtubeDetectedId = $derived(data.detectedIds?.youtube?.rawId);
  let youtubeDetectedType = $derived(data.detectedIds?.youtube?.type);

  // Sync Discord and artist features settings on data change
  let syncedSettingsId: number | null = null;
  $effect(() => {
    if (data.settings && data.settings.id !== syncedSettingsId) {
      syncedSettingsId = data.settings.id;
      discordWebhookUrl = data.discord?.webhookUrl ?? '';
      clipReviewWebhookUrl = data.clips?.reviewWebhookUrl ?? '';
      clipPublishedWebhookUrl = data.clips?.publishedWebhookUrl ?? '';
      discordEnabled = data.discord?.enabled ?? false;
      discordSchedule = (data.discord?.schedule as 'daily' | 'weekly' | 'monthly') ?? 'weekly';
      discordScheduleDay = data.discord?.scheduleDay ?? 1;
      discordScheduleTime = data.discord?.scheduleTime ?? '09:00';
      pressKitEnabled = data.settings.pressKitEnabled ?? false;
      clipsEnabled = data.settings.clipsEnabled ?? false;
      releasesEnabled = data.settings.releasesEnabled ?? false;
      subscribersEnabled = data.settings.subscribersEnabled ?? false;
      pixelsEnabled = data.settings.pixelsEnabled ?? false;
      metaPixelId = data.pixels?.metaPixelId ?? '';
      metaCapiToken = data.pixels?.metaCapiToken ?? '';
      tiktokPixelId = data.pixels?.tiktokPixelId ?? '';
      publishWebhookUrl = data.clips?.publishWebhookUrl ?? '';
      publishEnabled = data.clips?.publishEnabled ?? false;
      publishIntervalDays = data.clips?.publishIntervalDays ?? 3;
      publishHour = data.clips?.publishHour ?? 10;
      publishSecret = data.clips?.publishSecret ?? '';
    }
  });

  async function savePublishSettings() {
    savingPublish = true;
    publishResult = null;
    try {
      await updatePublishSettings({
        publishWebhookUrl: publishWebhookUrl || null,
        publishEnabled,
        publishIntervalDays,
        publishHour,
        publishSecret: publishSecret || null,
        clipReviewWebhookUrl: clipReviewWebhookUrl || null,
        clipPublishedWebhookUrl: clipPublishedWebhookUrl || null
      });
      await invalidateAll();
      publishResult = { success: true, message: 'Settings saved!' };
    } catch {
      publishResult = { success: false, message: 'Failed to save settings' };
    }
    savingPublish = false;
    setTimeout(() => (publishResult = null), 5000);
  }

  // Format numbers with K/M suffixes
  function formatNumber(n: number): string {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return n.toString();
  }

  // Social media handlers
  async function saveSpotifySettings() {
    savingSpotify = true;
    spotifyResult = null;
    try {
      const result = await updateSpotifyConfig({
        clientId: spotifyClientId,
        clientSecret: spotifyClientSecret
      });
      spotifyResult = result;
      if (result.success) {
        await invalidateAll();
      }
    } catch {
      spotifyResult = { success: false, message: 'Failed to save Spotify settings' };
    }
    savingSpotify = false;
    setTimeout(() => (spotifyResult = null), 5000);
  }

  async function saveGoogleSettings() {
    savingGoogle = true;
    googleResult = null;
    try {
      const result = await saveGoogleConfig({
        apiKey: googleApiKey,
        placesEnabled: googlePlacesEnabled,
        youtubeEnabled: googleYoutubeEnabled
      });
      googleResult = result;
      if (result.success) {
        await invalidateAll();
      }
    } catch {
      googleResult = { success: false, message: 'Failed to save Google settings' };
    }
    savingGoogle = false;
    setTimeout(() => (googleResult = null), 5000);
  }

  async function saveDiscordSettings() {
    savingDiscord = true;
    discordResult = null;
    try {
      await updateDiscordSettings({
        discordWebhookUrl: discordWebhookUrl || null,
        discordEnabled,
        discordSchedule,
        discordScheduleDay,
        discordScheduleTime
      });
      await invalidateAll();
      discordResult = { success: true, message: 'Settings saved!' };
    } catch {
      discordResult = { success: false, message: 'Failed to save settings' };
    }
    savingDiscord = false;
    setTimeout(() => (discordResult = null), 3000);
  }

  async function testWebhook() {
    if (!discordWebhookUrl) {
      discordResult = { success: false, message: 'Please enter a webhook URL first' };
      return;
    }
    testingWebhook = true;
    discordResult = null;
    try {
      const result = await testDiscordWebhook({ webhookUrl: discordWebhookUrl });
      discordResult = result;
    } catch {
      discordResult = { success: false, message: 'Failed to send test message' };
    }
    testingWebhook = false;
  }

  async function togglePressKit() {
    pressKitEnabled = !pressKitEnabled;
    await updateSettings({ pressKitEnabled });
  }

  async function toggleClips() {
    clipsEnabled = !clipsEnabled;
    await updateSettings({ clipsEnabled });
    await invalidateAll();
  }

  async function togglePixels() {
    pixelsEnabled = !pixelsEnabled;
    await updateSettings({ pixelsEnabled });
    await invalidateAll();
  }

  async function savePixels() {
    savingPixels = true;
    pixelResult = null;
    try {
      await updateSettings({
        metaPixelId: metaPixelId || null,
        metaCapiToken: metaCapiToken || null,
        tiktokPixelId: tiktokPixelId || null
      });
      await invalidateAll();
      pixelResult = { success: true, message: 'Saved' };
    } catch {
      pixelResult = { success: false, message: 'Could not save' };
    }
    savingPixels = false;
    setTimeout(() => (pixelResult = null), 4000);
  }

  async function toggleSubscribers() {
    subscribersEnabled = !subscribersEnabled;
    await updateSettings({ subscribersEnabled });
    await invalidateAll();
  }

  // invalidateAll because this one adds and removes a nav item, like clips.
  async function toggleReleases() {
    releasesEnabled = !releasesEnabled;
    await updateSettings({ releasesEnabled });
    await invalidateAll();
  }

  /**
   * Persists straight away, like the press kit switch — the detail fields below
   * keep their own Save button, so flipping the switch shouldn't also commit a
   * half-typed webhook URL.
   */
  async function toggleClipPublishing() {
    publishEnabled = !publishEnabled;
    await updatePublishSettings({
      publishWebhookUrl: data.clips?.publishWebhookUrl || null,
      publishEnabled,
      publishIntervalDays: data.clips?.publishIntervalDays ?? 3,
      publishHour: data.clips?.publishHour ?? 10,
      publishSecret: data.clips?.publishSecret || null
    });
    await invalidateAll();
  }
</script>

<div class="min-h-screen bg-gray-950 p-[clamp(1rem,4vw,1.5rem)]">
  <!-- Page Header -->

  <div class="max-w-2xl space-y-6">
    <!-- Google Integration (unified for YouTube + Places) -->
    <section class="rounded-xl border border-gray-800 bg-gray-900 p-5">
      <div class="mb-4 flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-600/20">
            <svg viewBox="0 0 24 24" class="h-5 w-5">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
          </div>
          <div>
            <h2 class="font-semibold text-white">Google APIs</h2>
            <p class="text-xs text-gray-500">YouTube stats & venue autocomplete</p>
          </div>
        </div>
        {#if data.googleConfig?.apiKey}
          <span class="rounded-full bg-blue-900/50 px-2.5 py-1 text-xs text-blue-400"
            >Connected</span
          >
        {/if}
      </div>

      <!-- YouTube stats if available -->
      {#if data.socialStats.youtube && googleYoutubeEnabled}
        <div
          class="mb-4 grid [grid-template-columns:repeat(auto-fit,minmax(min(100%,7rem),1fr))] gap-4 rounded-lg bg-gray-800/50 p-4"
        >
          <div>
            <div class="text-xs text-gray-500">YouTube Subscribers</div>
            <div class="text-lg font-semibold text-white">
              {formatNumber(data.socialStats.youtube.subscriberCount)}
            </div>
          </div>
          <div>
            <div class="text-xs text-gray-500">Total Views</div>
            <div class="text-lg font-semibold text-white">
              {formatNumber(data.socialStats.youtube.viewCount)}
            </div>
          </div>
          <div>
            <div class="text-xs text-gray-500">Videos</div>
            <div class="text-lg font-semibold text-white">
              {data.socialStats.youtube.videoCount}
            </div>
          </div>
        </div>
      {/if}

      <div class="space-y-4">
        <!-- API Key -->
        <div>
          <label for="googleApiKey" class="mb-1 block text-xs text-gray-500">API Key</label>
          <input
            id="googleApiKey"
            type="password"
            bind:value={googleApiKey}
            placeholder="AIza..."
            class={fieldClass}
          />
        </div>

        <!-- Service toggles -->
        <div class="space-y-3 rounded-lg bg-gray-800/50 p-3">
          <label class="flex items-center justify-between">
            <div>
              <span class="text-sm text-white">Places API</span>
              <p class="text-xs text-gray-500">Venue autocomplete for tour dates</p>
            </div>
            <ToggleSwitch
              bind:checked={googlePlacesEnabled}
              label="Toggle Places API"
              size="md"
              accent="blue"
              hideLabel
            />
          </label>

          <label class="flex items-center justify-between">
            <div>
              <span class="text-sm text-white">YouTube Data API</span>
              <p class="text-xs text-gray-500">Channel stats & subscriber count</p>
              {#if googleYoutubeEnabled && youtubeDetectedId}
                <p class="mt-1 text-xs text-green-400">Channel detected: {youtubeDetectedId}</p>
              {:else if googleYoutubeEnabled && !youtubeDetectedId}
                <p class="mt-1 text-xs text-yellow-400">
                  Add a YouTube channel link to enable stats
                </p>
              {/if}
            </div>
            <ToggleSwitch
              bind:checked={googleYoutubeEnabled}
              label="Toggle YouTube Data API"
              size="md"
              accent="blue"
              hideLabel
            />
          </label>
        </div>

        <div class="flex items-center gap-3">
          <button
            onclick={saveGoogleSettings}
            disabled={savingGoogle || !googleApiKey}
            class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {savingGoogle ? 'Saving...' : data.googleConfig?.apiKey ? 'Update' : 'Connect'}
          </button>
          {#if googleResult}
            <span class="text-sm {googleResult.success ? 'text-green-400' : 'text-red-400'}">
              {googleResult.message}
            </span>
          {/if}
        </div>
        <p class="text-xs text-gray-600">
          Get API key from <a
            href="https://console.cloud.google.com/apis/credentials"
            target="_blank"
            rel="noopener"
            class="text-blue-400 hover:underline">Google Cloud Console</a
          >. Enable Places API and/or YouTube Data API v3.
        </p>
      </div>
    </section>

    <!-- Discord Integration -->
    <section class="rounded-xl border border-gray-800 bg-gray-900 p-5">
      <div class="mb-4 flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div
            class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-600/20"
          >
            <svg
              class="h-5 w-5 text-indigo-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="1.5"
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
              />
            </svg>
          </div>
          <div>
            <h2 class="font-semibold text-white">Stats reports</h2>
            <p class="text-xs text-gray-500">Scheduled summaries posted to Discord</p>
          </div>
        </div>
        {#if discordEnabled && discordWebhookUrl}
          <span class="rounded-full bg-indigo-900/50 px-2.5 py-1 text-xs text-indigo-400"
            >Active</span
          >
        {/if}
      </div>

      <div class="space-y-4">
        <div>
          <label for="discordWebhook" class="mb-1 block text-xs text-gray-500">Webhook URL</label>
          <input
            id="discordWebhook"
            type="url"
            bind:value={discordWebhookUrl}
            placeholder="https://discord.com/api/webhooks/..."
            class={fieldClass}
          />
        </div>

        <label class="flex items-center justify-between">
          <span class="text-sm text-white">Enable scheduled reports</span>
          <ToggleSwitch
            bind:checked={discordEnabled}
            label="Toggle scheduled reports"
            size="md"
            accent="indigo"
            hideLabel
          />
        </label>

        {#if discordEnabled}
          <div
            class="grid [grid-template-columns:repeat(auto-fit,minmax(min(100%,7rem),1fr))] gap-3 rounded-lg bg-gray-800/50 p-3"
          >
            <div>
              <label for="discordSchedule" class="mb-1 block text-xs text-gray-500">Frequency</label
              >
              <select id="discordSchedule" bind:value={discordSchedule} class={fieldClass}>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>

            <div>
              <label for="discordScheduleDay" class="mb-1 block text-xs text-gray-500">
                {discordSchedule === 'weekly'
                  ? 'Day'
                  : discordSchedule === 'monthly'
                    ? 'Day'
                    : 'N/A'}
              </label>
              {#if discordSchedule === 'weekly'}
                <select id="discordScheduleDay" bind:value={discordScheduleDay} class={fieldClass}>
                  <option value={1}>Monday</option>
                  <option value={2}>Tuesday</option>
                  <option value={3}>Wednesday</option>
                  <option value={4}>Thursday</option>
                  <option value={5}>Friday</option>
                  <option value={6}>Saturday</option>
                  <option value={0}>Sunday</option>
                </select>
              {:else if discordSchedule === 'monthly'}
                <select id="discordScheduleDay" bind:value={discordScheduleDay} class={fieldClass}>
                  {#each Array.from({ length: 28 }, (_, i) => i + 1) as day}
                    <option value={day}>{day}</option>
                  {/each}
                </select>
              {:else}
                <input disabled value="N/A" class={fieldClass} />
              {/if}
            </div>

            <div>
              <label for="discordScheduleTime" class="mb-1 block text-xs text-gray-500">Time</label>
              <input
                id="discordScheduleTime"
                type="time"
                bind:value={discordScheduleTime}
                class={fieldClass}
              />
            </div>
          </div>
        {/if}

        <div class="flex items-center gap-3">
          <button
            onclick={saveDiscordSettings}
            disabled={savingDiscord}
            class="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {savingDiscord ? 'Saving...' : 'Save'}
          </button>
          <button
            onclick={testWebhook}
            disabled={testingWebhook || !discordWebhookUrl}
            class="rounded-lg border border-gray-700 bg-gray-800 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
          >
            {testingWebhook ? 'Sending...' : 'Test'}
          </button>
          {#if discordResult}
            <span class="text-sm {discordResult.success ? 'text-green-400' : 'text-red-400'}">
              {discordResult.message}
            </span>
          {/if}
        </div>

        {#if data.discord?.lastSent}
          <p class="text-xs text-gray-500">
            Last report: {new Date(data.discord?.lastSent).toLocaleString()}
          </p>
        {/if}

        <p class="text-xs text-gray-600">
          Create a webhook in your Discord server settings under Integrations → Webhooks.
        </p>
      </div>
    </section>

    <!-- Artist Features Section -->
    <div class="pt-4">
      <h2 class="mb-4 text-lg font-semibold text-white">Artist Features</h2>

      <!-- Spotify Integration -->
      <section class="mb-6 rounded-xl border border-gray-800 bg-gray-900 p-5">
        <div class="mb-4 flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div
              class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-600/20"
            >
              <svg viewBox="0 0 24 24" class="h-5 w-5" style="fill: #1DB954">
                <path
                  d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"
                />
              </svg>
            </div>
            <div>
              <h3 class="font-semibold text-white">Spotify for Artists</h3>
              <p class="text-xs text-gray-500">Track followers and popularity stats</p>
            </div>
          </div>
          {#if data.socialStats.spotify}
            <span class="rounded-full bg-green-900/50 px-2.5 py-1 text-xs text-green-400"
              >Connected</span
            >
          {/if}
        </div>

        {#if data.socialStats.spotify}
          <div
            class="mb-4 grid [grid-template-columns:repeat(auto-fit,minmax(min(100%,7rem),1fr))] gap-4 rounded-lg bg-gray-800/50 p-4"
          >
            <div>
              <div class="text-xs text-gray-500">Followers</div>
              <div class="text-lg font-semibold text-white">
                {formatNumber(data.socialStats.spotify.followers)}
              </div>
            </div>
            <div>
              <div class="text-xs text-gray-500">Popularity</div>
              <div class="text-lg font-semibold text-white">
                {data.socialStats.spotify.popularity}/100
              </div>
            </div>
            <div>
              <div class="text-xs text-gray-500">Last Updated</div>
              <div class="text-sm text-gray-300">
                {new Date(data.socialStats.spotify.lastUpdated).toLocaleDateString()}
              </div>
            </div>
          </div>
        {/if}

        <!-- Auto-detected artist info -->
        {#if spotifyDetectedId}
          <div class="mb-4 rounded-lg border border-green-800/50 bg-green-900/20 p-3">
            <div class="flex items-center gap-2 text-sm text-green-400">
              <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M5 13l4 4L19 7"
                />
              </svg>
              Artist detected from your links
            </div>
            <p class="mt-1 text-xs text-gray-400">ID: {spotifyDetectedId}</p>
          </div>
        {:else}
          <div class="mb-4 rounded-lg border border-yellow-800/50 bg-yellow-900/20 p-3">
            <div class="flex items-center gap-2 text-sm text-yellow-400">
              <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
              No Spotify artist link found
            </div>
            <p class="mt-1 text-xs text-gray-400">
              Add a Spotify artist link to your page first, or it will be detected automatically.
            </p>
          </div>
        {/if}

        <div class="space-y-3">
          <div
            class="grid [grid-template-columns:repeat(auto-fit,minmax(min(100%,11rem),1fr))] gap-3"
          >
            <div>
              <label for="spotifyClientId" class="mb-1 block text-xs text-gray-500">Client ID</label
              >
              <input
                id="spotifyClientId"
                type="text"
                bind:value={spotifyClientId}
                placeholder="From Spotify Developer Dashboard"
                class={fieldClass}
              />
            </div>
            <div>
              <label for="spotifyClientSecret" class="mb-1 block text-xs text-gray-500"
                >Client Secret</label
              >
              <input
                id="spotifyClientSecret"
                type="password"
                bind:value={spotifyClientSecret}
                placeholder="From Spotify Developer Dashboard"
                class={fieldClass}
              />
            </div>
          </div>
          <div class="flex items-center gap-3">
            <button
              onclick={saveSpotifySettings}
              disabled={savingSpotify ||
                !spotifyDetectedId ||
                !spotifyClientId ||
                !spotifyClientSecret}
              class="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
            >
              {savingSpotify ? 'Connecting...' : data.socialStats.spotify ? 'Update' : 'Connect'}
            </button>
            {#if spotifyResult}
              <span class="text-sm {spotifyResult.success ? 'text-green-400' : 'text-red-400'}">
                {spotifyResult.message}
              </span>
            {/if}
          </div>
          <p class="text-xs text-gray-600">
            Get credentials from <a
              href="https://developer.spotify.com/dashboard"
              target="_blank"
              rel="noopener"
              class="text-green-400 hover:underline">Spotify Developer Dashboard</a
            >
          </p>
        </div>
      </section>

      <!-- Press Kit Toggle -->
      <section class="rounded-xl border border-gray-800 bg-gray-900 p-5">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-600/20">
              <svg
                class="h-5 w-5 text-violet-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="1.5"
                  d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z"
                />
              </svg>
            </div>
            <div>
              <h3 class="font-semibold text-white">Press Kit</h3>
              <p class="text-xs text-gray-500">Enable downloadable press kit in Media library</p>
            </div>
          </div>
          <ToggleSwitch
            checked={pressKitEnabled}
            label="Toggle press kit"
            onchange={togglePressKit}
            size="md"
            hideLabel
          />
        </div>
        <p class="mt-3 text-xs text-gray-500">
          When enabled, you can create a downloadable press kit with high-res images and bio from
          the Media page.
        </p>
      </section>

      <!-- Ad Pixels -->
      <section class="mt-6 rounded-xl border border-gray-800 bg-gray-900 p-5">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-600/20">
              <svg
                class="h-5 w-5 text-violet-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="1.5"
                  d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                />
              </svg>
            </div>
            <div>
              <h3 class="font-semibold text-white">Ad pixels</h3>
              <p class="text-xs text-gray-500">Attribute ad spend to plays and sign-ups</p>
            </div>
          </div>
          <ToggleSwitch
            checked={pixelsEnabled}
            label="Toggle ad pixels"
            onchange={togglePixels}
            size="md"
            hideLabel
          />
        </div>

        {#if !pixelsEnabled}
          <p class="mt-3 text-xs text-gray-500">
            Adds Meta and TikTok pixels to your public pages, and reports a conversion from the
            server when someone opens a streaming link — the half an ad blocker can't drop.
          </p>
        {:else}
          <!-- Stated plainly because switching this on has a legal consequence
               that pasting an id into a field doesn't look like it should. -->
          <div class="mt-4 rounded-lg border border-amber-700/50 bg-amber-950/40 p-3 text-sm">
            <p class="font-medium text-amber-300">These set cookies for an advertiser</p>
            <p class="mt-1 text-amber-200/70">
              In the EEA that needs the visitor's consent <em>before</em> the script loads. Artistack
              has no consent banner yet, so leave this off on a public site until it does, or add one.
            </p>
          </div>

          <div class="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label class={labelClass} for="meta-pixel">Meta pixel ID</label>
              <input
                id="meta-pixel"
                class={fieldClass}
                bind:value={metaPixelId}
                placeholder="123456789012345"
              />
            </div>
            <div>
              <label class={labelClass} for="tiktok-pixel">TikTok pixel ID</label>
              <input
                id="tiktok-pixel"
                class={fieldClass}
                bind:value={tiktokPixelId}
                placeholder="CXXXXXXXXXXXXXXXXXXX"
              />
            </div>
          </div>

          <div class="mt-4">
            <label class={labelClass} for="meta-capi">Meta Conversions API token</label>
            <input
              id="meta-capi"
              type="password"
              class={fieldClass}
              bind:value={metaCapiToken}
              placeholder="Optional"
            />
            <p class="mt-1 text-xs text-gray-500">
              Optional, and only used server-side. Without it the browser pixel still works; with
              it, a click through to a streaming service is reported even when the pixel is blocked.
            </p>
          </div>

          <div class="mt-4 flex items-center gap-3">
            <button
              onclick={savePixels}
              disabled={savingPixels}
              class="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-500 disabled:opacity-50"
            >
              {savingPixels ? 'Saving…' : 'Save'}
            </button>
            {#if pixelResult}
              <span class="text-sm {pixelResult.success ? 'text-green-400' : 'text-red-400'}">
                {pixelResult.message}
              </span>
            {/if}
          </div>
        {/if}
      </section>

      <!-- Fan List Toggle -->
      <section class="mt-6 rounded-xl border border-gray-800 bg-gray-900 p-5">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-600/20">
              <svg
                class="h-5 w-5 text-violet-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="1.5"
                  d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                />
              </svg>
            </div>
            <div>
              <h3 class="font-semibold text-white">Fan list</h3>
              <p class="text-xs text-gray-500">Collect email addresses on your own pages</p>
            </div>
          </div>
          <ToggleSwitch
            checked={subscribersEnabled}
            label="Toggle fan list"
            onchange={toggleSubscribers}
            size="md"
            hideLabel
          />
        </div>

        {#if !subscribersEnabled}
          <p class="mt-3 text-xs text-gray-500">
            Adds a sign-up form to your release pages and an Audience section to collect what it
            gathers. Worth having even when a pre-save runs elsewhere — hosted pre-saves keep the
            addresses they collect unless you pay for them.
          </p>
        {:else}
          <p class="mt-3 text-xs text-gray-500">
            Every sign-up records when consent was given and carries a one-click unsubscribe link,
            so a mailing can honour it without anyone logging in.
          </p>
        {/if}
      </section>

      <!-- Release Pages Toggle -->
      <section class="mt-6 rounded-xl border border-gray-800 bg-gray-900 p-5">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-600/20">
              <svg
                class="h-5 w-5 text-violet-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="1.5"
                  d="M9 19V6l12-3v13M9 19a3 3 0 11-6 0 3 3 0 016 0zm12-3a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
            </div>
            <div>
              <h3 class="font-semibold text-white">Release pages</h3>
              <p class="text-xs text-gray-500">
                Smart links for singles and albums, on your own domain
              </p>
            </div>
          </div>
          <ToggleSwitch
            checked={releasesEnabled}
            label="Toggle release pages"
            onchange={toggleReleases}
            size="md"
            hideLabel
          />
        </div>

        {#if !releasesEnabled}
          <p class="mt-3 text-xs text-gray-500">
            For musicians. Adds a Releases section where each single or album gets its own page,
            routing listeners to the streaming service they already use, with clicks tracked per
            platform. Leave this off if you publish work of another kind.
          </p>
        {:else}
          <p class="mt-3 text-xs text-gray-500">
            Pages already published stay live if you switch this off — only the Releases section is
            hidden. A link that's out in the world keeps working.
          </p>
        {/if}
      </section>

      <!-- Clip Publishing Toggle -->
      <section class="mt-6 rounded-xl border border-gray-800 bg-gray-900 p-5">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-600/20">
              <svg
                class="h-5 w-5 text-violet-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="1.5"
                  d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z"
                />
              </svg>
            </div>
            <div>
              <h3 class="font-semibold text-white">Clips</h3>
              <p class="text-xs text-gray-500">Assemble footage into branded social videos</p>
            </div>
          </div>
          <ToggleSwitch
            checked={clipsEnabled}
            label="Toggle clips"
            onchange={toggleClips}
            size="md"
            hideLabel
          />
        </div>

        {#if !clipsEnabled}
          <p class="mt-3 text-xs text-gray-500">
            Adds the Clips studio and its brand settings. Rendering and review work on their own —
            scheduled publishing is a separate switch that appears once this is on.
          </p>
        {:else}
          <!-- Scheduled release is deliberately a second switch: you render and
               review clips long before any of them should go out. -->
          <div class="mt-4 flex items-center justify-between border-t border-gray-800 pt-4">
            <div>
              <h4 class="text-sm font-medium text-white">Scheduled publishing</h4>
              <p class="text-xs text-gray-500">
                POST a queued clip to your webhook as its slot comes due — video link, poster,
                preview link and post sheet as JSON. Whatever receives it (n8n, a script, your own
                service) owns the platform credentials.
              </p>
            </div>
            <ToggleSwitch
              checked={publishEnabled}
              onchange={toggleClipPublishing}
              label="Toggle scheduled publishing"
              size="md"
              hideLabel
            />
          </div>
        {/if}

        {#if clipsEnabled && publishEnabled}
          <!-- Enabling without a target does nothing at all, so say so rather
               than leaving a switch that looks on but never fires. -->
          {#if !publishWebhookUrl}
            <p
              class="mt-3 rounded-lg border border-amber-900/50 bg-amber-950/30 px-3 py-2 text-xs text-amber-300"
            >
              Nothing will be released until a webhook URL is set below.
            </p>
          {/if}

          <div class="mt-4 space-y-4 border-t border-gray-800 pt-4">
            <div>
              <label class={labelClass} for="publish-url">Webhook URL</label>
              <input
                id="publish-url"
                type="url"
                bind:value={publishWebhookUrl}
                placeholder="https://n8n.example.com/webhook/clip-publish"
                class={fieldClass}
              />
            </div>

            <div
              class="grid [grid-template-columns:repeat(auto-fill,minmax(min(100%,14rem),1fr))] gap-4"
            >
              <div>
                <label class={labelClass} for="publish-interval"> Days between releases </label>
                <input
                  id="publish-interval"
                  type="number"
                  min="0"
                  max="365"
                  bind:value={publishIntervalDays}
                  class={fieldClass}
                />
              </div>
              <div>
                <label class={labelClass} for="publish-hour"> Hour of day (0-23) </label>
                <input
                  id="publish-hour"
                  type="number"
                  min="0"
                  max="23"
                  bind:value={publishHour}
                  class={fieldClass}
                />
              </div>
              <div>
                <div class="mb-1 flex items-center justify-between gap-2">
                  <label class="text-sm text-gray-400" for="publish-secret">Signing secret</label>
                  <button
                    type="button"
                    onclick={generatePublishSecret}
                    class="text-xs text-violet-400 hover:text-violet-300"
                  >
                    Generate
                  </button>
                </div>
                <input
                  id="publish-secret"
                  type={publishSecret ? 'text' : 'password'}
                  bind:value={publishSecret}
                  placeholder="recommended"
                  class={fieldClass}
                />
              </div>
            </div>

            <!-- Two channels, because they are read by different people at
                 different urgencies: a review wants acting on today, a release
                 is an announcement. Either can be left empty. -->
            <div
              class="grid [grid-template-columns:repeat(auto-fill,minmax(min(100%,18rem),1fr))] gap-4"
            >
              <div>
                <label class={labelClass} for="clip-review-webhook">Discord: review channel</label>
                <input
                  id="clip-review-webhook"
                  type="url"
                  bind:value={clipReviewWebhookUrl}
                  placeholder="https://discord.com/api/webhooks/..."
                  class={fieldClass}
                />
                <p class="mt-1 text-xs text-gray-600">Where clips go to be approved.</p>
              </div>
              <div>
                <label class={labelClass} for="clip-published-webhook">
                  Discord: published channel
                </label>
                <input
                  id="clip-published-webhook"
                  type="url"
                  bind:value={clipPublishedWebhookUrl}
                  placeholder="https://discord.com/api/webhooks/..."
                  class={fieldClass}
                />
                <p class="mt-1 text-xs text-gray-600">Announced when a clip is released.</p>
              </div>
            </div>

            <div class="flex items-center gap-3">
              <button
                onclick={savePublishSettings}
                disabled={savingPublish}
                class="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-500 disabled:opacity-50"
              >
                {savingPublish ? 'Saving...' : 'Save publishing settings'}
              </button>
              {#if publishResult}
                <span class="text-sm {publishResult.success ? 'text-green-400' : 'text-red-400'}">
                  {publishResult.message}
                </span>
              {/if}
            </div>

            {#if data.clips?.publishLastSent}
              <p class="text-xs text-gray-500">
                Last release: {new Date(data.clips?.publishLastSent).toLocaleString()}
              </p>
            {/if}

            <p class="text-xs text-gray-600">
              A signing secret is sent as an
              <code class="text-gray-500">X-Artistack-Signature</code>
              header (HMAC-SHA256 of the body), so the receiver can verify the call came from here. It
              also authenticates the callback the receiver makes to report where a clip was published
              — without a secret set, that callback is rejected.
            </p>
          </div>
        {/if}
      </section>
    </div>
  </div>
</div>
