<script lang="ts">
  import type { PageData } from './$types';
  import {
    updateSpotifyConfig,
    saveGoogleConfig,
    updateDiscordSettings,
    testDiscordWebhook
  } from './data.remote';
  import { updateSettings } from '../settings/data.remote';
  import { invalidateAll } from '$app/navigation';

  let { data }: { data: PageData } = $props();

  // Spotify settings state
  let spotifyClientId = $state('');
  let spotifyClientSecret = $state('');

  // Google settings state (unified for Places + YouTube)
  let googleApiKey = $state('');
  let googlePlacesEnabled = $state(true);
  let googleYoutubeEnabled = $state(true);

  // Discord settings state
  let discordWebhookUrl = $state('');
  let discordEnabled = $state(false);
  let discordSchedule = $state<'daily' | 'weekly' | 'monthly'>('weekly');
  let discordScheduleDay = $state(1);
  let discordScheduleTime = $state('09:00');

  // Artist features state
  let pressKitEnabled = $state(false);

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

  // Sync Spotify config on data change
  $effect(() => {
    if (data.spotifyConfig) {
      spotifyClientId = data.spotifyConfig.clientId ?? '';
      spotifyClientSecret = data.spotifyConfig.clientSecret ?? '';
    }
  });

  // Sync Google config on data change
  $effect(() => {
    if (data.googleConfig) {
      googleApiKey = data.googleConfig.apiKey ?? '';
      googlePlacesEnabled = data.googleConfig.placesEnabled ?? true;
      googleYoutubeEnabled = data.googleConfig.youtubeEnabled ?? true;
    }
  });

  // Sync Discord and artist features settings on data change
  let syncedSettingsId: number | null = null;
  $effect(() => {
    if (data.settings && data.settings.id !== syncedSettingsId) {
      syncedSettingsId = data.settings.id;
      discordWebhookUrl = data.settings.discordWebhookUrl ?? '';
      discordEnabled = data.settings.discordEnabled ?? false;
      discordSchedule =
        (data.settings.discordSchedule as 'daily' | 'weekly' | 'monthly') ?? 'weekly';
      discordScheduleDay = data.settings.discordScheduleDay ?? 1;
      discordScheduleTime = data.settings.discordScheduleTime ?? '09:00';
      pressKitEnabled = data.settings.pressKitEnabled ?? false;
    }
  });

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
</script>

<div class="min-h-screen bg-gray-950 p-6">
  <!-- Page Header -->
  <header class="mb-6">
    <h1 class="text-2xl font-semibold text-white">Integrations</h1>
    <p class="text-sm text-gray-500">Connect external services to automatically sync content</p>
  </header>

  <div class="max-w-2xl space-y-6">
    <!-- Google Integration (unified for YouTube + Places) -->
    <section class="rounded-xl border border-gray-800 bg-gray-900 p-5">
      <div class="mb-4 flex items-center justify-between">
        <div class="flex items-center gap-3">
          <svg viewBox="0 0 24 24" class="h-8 w-8">
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
        <div class="mb-4 grid grid-cols-3 gap-4 rounded-lg bg-gray-800/50 p-4">
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
            class="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
          />
        </div>

        <!-- Service toggles -->
        <div class="space-y-3 rounded-lg bg-gray-800/50 p-3">
          <label class="flex items-center justify-between">
            <div>
              <span class="text-sm text-white">Places API</span>
              <p class="text-xs text-gray-500">Venue autocomplete for tour dates</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={googlePlacesEnabled}
              aria-label="Toggle Places API"
              onclick={() => (googlePlacesEnabled = !googlePlacesEnabled)}
              class="relative h-6 w-11 rounded-full transition-colors {googlePlacesEnabled
                ? 'bg-blue-600'
                : 'bg-gray-600'}"
            >
              <span
                class="absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform {googlePlacesEnabled
                  ? 'translate-x-5'
                  : ''}"
              ></span>
            </button>
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
            <button
              type="button"
              role="switch"
              aria-checked={googleYoutubeEnabled}
              aria-label="Toggle YouTube Data API"
              onclick={() => (googleYoutubeEnabled = !googleYoutubeEnabled)}
              class="relative h-6 w-11 rounded-full transition-colors {googleYoutubeEnabled
                ? 'bg-blue-600'
                : 'bg-gray-600'}"
            >
              <span
                class="absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform {googleYoutubeEnabled
                  ? 'translate-x-5'
                  : ''}"
              ></span>
            </button>
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
          <svg viewBox="0 0 24 24" class="h-8 w-8" style="fill: #5865F2">
            <path
              d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z"
            />
          </svg>
          <div>
            <h2 class="font-semibold text-white">Discord</h2>
            <p class="text-xs text-gray-500">Receive automated stats reports</p>
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
            class="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-indigo-500 focus:outline-none"
          />
        </div>

        <label class="flex items-center justify-between">
          <span class="text-sm text-white">Enable scheduled reports</span>
          <button
            type="button"
            role="switch"
            aria-checked={discordEnabled}
            aria-label="Toggle scheduled reports"
            onclick={() => (discordEnabled = !discordEnabled)}
            class="relative h-6 w-11 rounded-full transition-colors {discordEnabled
              ? 'bg-indigo-600'
              : 'bg-gray-600'}"
          >
            <span
              class="absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform {discordEnabled
                ? 'translate-x-5'
                : ''}"
            ></span>
          </button>
        </label>

        {#if discordEnabled}
          <div class="grid grid-cols-3 gap-3 rounded-lg bg-gray-800/50 p-3">
            <div>
              <label for="discordSchedule" class="mb-1 block text-xs text-gray-500">Frequency</label
              >
              <select
                id="discordSchedule"
                bind:value={discordSchedule}
                class="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
              >
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
                <select
                  id="discordScheduleDay"
                  bind:value={discordScheduleDay}
                  class="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
                >
                  <option value={1}>Monday</option>
                  <option value={2}>Tuesday</option>
                  <option value={3}>Wednesday</option>
                  <option value={4}>Thursday</option>
                  <option value={5}>Friday</option>
                  <option value={6}>Saturday</option>
                  <option value={0}>Sunday</option>
                </select>
              {:else if discordSchedule === 'monthly'}
                <select
                  id="discordScheduleDay"
                  bind:value={discordScheduleDay}
                  class="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
                >
                  {#each Array.from({ length: 28 }, (_, i) => i + 1) as day}
                    <option value={day}>{day}</option>
                  {/each}
                </select>
              {:else}
                <input
                  disabled
                  value="N/A"
                  class="w-full rounded-lg border border-gray-700 bg-gray-800/50 px-3 py-2 text-sm text-gray-500"
                />
              {/if}
            </div>

            <div>
              <label for="discordScheduleTime" class="mb-1 block text-xs text-gray-500">Time</label>
              <input
                id="discordScheduleTime"
                type="time"
                bind:value={discordScheduleTime}
                class="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
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

        {#if data.settings?.discordLastSent}
          <p class="text-xs text-gray-500">
            Last report: {new Date(data.settings.discordLastSent).toLocaleString()}
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
            <svg viewBox="0 0 24 24" class="h-8 w-8" style="fill: #1DB954">
              <path
                d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"
              />
            </svg>
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
          <div class="mb-4 grid grid-cols-3 gap-4 rounded-lg bg-gray-800/50 p-4">
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
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label for="spotifyClientId" class="mb-1 block text-xs text-gray-500">Client ID</label
              >
              <input
                id="spotifyClientId"
                type="text"
                bind:value={spotifyClientId}
                placeholder="From Spotify Developer Dashboard"
                class="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-green-500 focus:outline-none"
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
                class="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-green-500 focus:outline-none"
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
          <button
            type="button"
            role="switch"
            aria-checked={pressKitEnabled}
            aria-label="Toggle press kit"
            onclick={togglePressKit}
            class="relative h-6 w-11 rounded-full transition-colors {pressKitEnabled
              ? 'bg-violet-600'
              : 'bg-gray-600'}"
          >
            <span
              class="absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform {pressKitEnabled
                ? 'translate-x-5'
                : ''}"
            ></span>
          </button>
        </div>
        <p class="mt-3 text-xs text-gray-500">
          When enabled, you can create a downloadable press kit with high-res images and bio from
          the Media page.
        </p>
      </section>
    </div>
  </div>
</div>
