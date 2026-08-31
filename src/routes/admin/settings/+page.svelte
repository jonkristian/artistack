<script lang="ts">
  import { fieldClass, labelClass } from '$lib/utils/classes';
  import { SectionCard } from '$lib/components/cards';
  import { MediaPicker, ToggleSwitch } from '$lib/components/ui';
  import type { PageData } from './$types';
  import {
    updateSettings,
    generateFavicon,
    generateFaviconFromInitials,
    updateSmtpSettings,
    testSmtp
  } from './data.remote';
  import { invalidateAll } from '$app/navigation';

  let { data }: { data: PageData } = $props();

  // Available locales
  const locales = [
    { code: 'nb-NO', name: 'Norwegian (Bokmål)', example: '31. jan. 2026' },
    { code: 'en-GB', name: 'English (UK)', example: '31 Jan 2026' },
    { code: 'en-US', name: 'English (US)', example: 'Jan 31, 2026' },
    { code: 'de-DE', name: 'German', example: '31. Jan. 2026' },
    { code: 'sv-SE', name: 'Swedish', example: '31 jan. 2026' },
    { code: 'da-DK', name: 'Danish', example: '31. jan. 2026' },
    { code: 'fi-FI', name: 'Finnish', example: '31. tammik. 2026' },
    { code: 'fr-FR', name: 'French', example: '31 janv. 2026' },
    { code: 'es-ES', name: 'Spanish', example: '31 ene 2026' },
    { code: 'nl-NL', name: 'Dutch', example: '31 jan. 2026' }
  ];

  // Settings state
  let siteTitle = $state('');
  let locale = $state('nb-NO');

  // Favicon state
  let selectedFaviconUrl = $state<string | null>(null);
  let faviconText = $state('');
  let faviconRounded = $state(false);
  let faviconLength = $state(2);
  let faviconGenerated = $state(false);
  let faviconCacheBust = $state(Date.now());
  let isGenerating = $state(false);

  // SMTP state
  let smtpHost = $state('');
  let smtpPort = $state(587);
  let smtpUser = $state('');
  let smtpPassword = $state('');
  let smtpFromAddress = $state('');
  let smtpFromName = $state('');
  let smtpTls = $state(true);
  let smtpTestLoading = $state(false);
  let smtpTestResult = $state<{ success: boolean; error?: string } | null>(null);

  // Sync from data.settings on load
  let syncedSettingsId: number | null = null;
  $effect(() => {
    if (data.settings && data.settings.id !== syncedSettingsId) {
      syncedSettingsId = data.settings.id;
      siteTitle = data.settings.siteTitle ?? '';
      locale = data.settings.locale ?? 'nb-NO';
      selectedFaviconUrl = data.settings.faviconUrl ?? null;
      faviconGenerated = data.settings.faviconGenerated ?? false;
      // SMTP
      smtpHost = data.mail?.smtpHost ?? '';
      smtpPort = data.mail?.smtpPort ?? 587;
      smtpUser = data.mail?.smtpUser ?? '';
      smtpPassword = data.mail?.smtpPassword ?? '';
      smtpFromAddress = data.mail?.smtpFromAddress ?? '';
      smtpFromName = data.mail?.smtpFromName ?? '';
      smtpTls = data.mail?.smtpTls ?? true;
    }
  });

  // Auto-save with debounce
  let saveTimeout: ReturnType<typeof setTimeout>;
  let initialized = false;

  $effect(() => {
    // Track values to trigger on change
    const values = {
      siteTitle: siteTitle || null,
      locale
    };

    if (!initialized) {
      initialized = true;
      return;
    }

    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(async () => {
      await updateSettings(values);
    }, 500);
  });

  // Get current locale info
  const currentLocale = $derived(locales.find((l) => l.code === locale) ?? locales[0]);

  // Handle favicon generation
  async function handleGenerateFavicon() {
    isGenerating = true;
    try {
      if (selectedFaviconUrl) {
        await generateFavicon({ sourceUrl: selectedFaviconUrl });
      } else {
        await generateFaviconFromInitials({
          name: faviconText || undefined,
          rounded: faviconRounded,
          length: faviconLength
        });
      }
      faviconGenerated = true;
      faviconCacheBust = Date.now();
      await invalidateAll();
    } catch (error) {
      console.error('Failed to generate favicon:', error);
    } finally {
      isGenerating = false;
    }
  }

  // Auto-save SMTP settings with debounce
  let smtpSaveTimeout: ReturnType<typeof setTimeout>;
  let smtpInitialized = false;

  $effect(() => {
    const smtpValues = {
      smtpHost: smtpHost || null,
      smtpPort: smtpPort || null,
      smtpUser: smtpUser || null,
      smtpPassword: smtpPassword || null,
      smtpFromAddress: smtpFromAddress || null,
      smtpFromName: smtpFromName || null,
      smtpTls
    };

    if (!smtpInitialized) {
      smtpInitialized = true;
      return;
    }

    clearTimeout(smtpSaveTimeout);
    smtpSaveTimeout = setTimeout(async () => {
      await updateSmtpSettings(smtpValues);
      smtpTestResult = null;
    }, 500);
  });

  // Test SMTP connection
  async function handleTestSmtp() {
    smtpTestLoading = true;
    smtpTestResult = null;
    try {
      smtpTestResult = await testSmtp({});
    } finally {
      smtpTestLoading = false;
    }
  }
</script>

<div class="max-w-2xl space-y-6">
  <SectionCard title="General">
    <div class="space-y-4">
      <div>
        <label for="site-title" class={labelClass}> Site Title </label>
        <input
          id="site-title"
          type="text"
          bind:value={siteTitle}
          placeholder={data.profile?.name || 'Artist Name'}
          class={fieldClass}
        />
        <p class="mt-2 text-sm text-gray-500">
          Used for browser tab and PWA. Leave empty to use artist name.
        </p>
      </div>

      <div>
        <label for="locale" class={labelClass}> Date & Time Format </label>
        <select id="locale" bind:value={locale} class={fieldClass}>
          {#each locales as l (l.code)}
            <option value={l.code}>{l.name}</option>
          {/each}
        </select>
        <p class="mt-2 text-sm text-gray-500">
          Example: <span class="text-gray-400">{currentLocale.example}</span>
        </p>
      </div>
    </div>
  </SectionCard>

  <SectionCard title="Email / SMTP">
    <div class="space-y-4">
      <p class="text-sm text-gray-400">
        Configure SMTP settings for sending password reset emails.
      </p>

      <div class="grid [grid-template-columns:repeat(auto-fit,minmax(min(100%,11rem),1fr))] gap-4">
        <div>
          <label for="smtp-host" class={labelClass}> SMTP Host </label>
          <input
            id="smtp-host"
            type="text"
            bind:value={smtpHost}
            placeholder="smtp.example.com"
            class={fieldClass}
          />
        </div>

        <div>
          <label for="smtp-port" class={labelClass}> Port </label>
          <input
            id="smtp-port"
            type="number"
            bind:value={smtpPort}
            placeholder="587"
            class={fieldClass}
          />
        </div>
      </div>

      <div class="grid [grid-template-columns:repeat(auto-fit,minmax(min(100%,11rem),1fr))] gap-4">
        <div>
          <label for="smtp-user" class={labelClass}> Username </label>
          <input
            id="smtp-user"
            type="text"
            bind:value={smtpUser}
            placeholder="user@example.com"
            class={fieldClass}
          />
        </div>

        <div>
          <label for="smtp-password" class={labelClass}> Password </label>
          <input
            id="smtp-password"
            type="password"
            bind:value={smtpPassword}
            placeholder="••••••••"
            class={fieldClass}
          />
        </div>
      </div>

      <div class="grid [grid-template-columns:repeat(auto-fit,minmax(min(100%,11rem),1fr))] gap-4">
        <div>
          <label for="smtp-from-address" class={labelClass}> From Address </label>
          <input
            id="smtp-from-address"
            type="email"
            bind:value={smtpFromAddress}
            placeholder="noreply@example.com"
            class={fieldClass}
          />
          <p class="mt-1 text-xs text-gray-500">Defaults to username if empty</p>
        </div>

        <div>
          <label for="smtp-from-name" class={labelClass}> From Name </label>
          <input
            id="smtp-from-name"
            type="text"
            bind:value={smtpFromName}
            placeholder="Artistack"
            class={fieldClass}
          />
        </div>
      </div>

      <div
        class="flex items-center justify-between rounded-lg border border-gray-700 bg-gray-800/50 px-4 py-3"
      >
        <div>
          <p class="text-sm font-medium text-gray-300">Use TLS</p>
          <p class="text-xs text-gray-500">Enable TLS encryption for SMTP connection</p>
        </div>
        <ToggleSwitch bind:checked={smtpTls} label="Toggle TLS encryption" size="md" hideLabel />
      </div>

      <div class="flex items-center gap-4">
        <button
          type="button"
          onclick={handleTestSmtp}
          disabled={!smtpHost || !smtpUser || !smtpPassword || smtpTestLoading}
          class="rounded-lg bg-gray-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {smtpTestLoading ? 'Testing...' : 'Test Connection'}
        </button>

        {#if smtpTestResult}
          {#if smtpTestResult.success}
            <span class="flex items-center gap-1.5 text-sm text-emerald-400">
              <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M5 13l4 4L19 7"
                />
              </svg>
              Connection successful
            </span>
          {:else}
            <span class="flex items-center gap-1.5 text-sm text-red-400">
              <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
              {smtpTestResult.error || 'Connection failed'}
            </span>
          {/if}
        {/if}
      </div>
    </div>
  </SectionCard>

  <SectionCard title="Favicon & PWA">
    <div class="space-y-4">
      <p class="text-sm text-gray-400">
        Generate favicon and PWA icons from an image or text initials.
      </p>

      <div class="grid grid-cols-[auto_1fr] gap-6">
        <div class="w-36">
          <span class={labelClass}>Image</span>
          <MediaPicker
            value={selectedFaviconUrl}
            label=""
            media={data.media ?? []}
            aspectRatio="1/1"
            noCrop={true}
            onselect={(url) => (selectedFaviconUrl = url)}
          />
        </div>

        <div class="space-y-3" class:opacity-40={!!selectedFaviconUrl}>
          <div>
            <label for="favicon-text" class={labelClass}> Text </label>
            <input
              id="favicon-text"
              type="text"
              bind:value={faviconText}
              disabled={!!selectedFaviconUrl}
              placeholder={data.settings?.siteTitle || data.profile?.name || 'Site Title'}
              class={fieldClass}
            />
            <p class="mt-1 text-sm text-gray-500">Leave empty to use site title.</p>
          </div>

          <div
            class="grid [grid-template-columns:repeat(auto-fit,minmax(min(100%,11rem),1fr))] gap-4"
          >
            <div>
              <label for="favicon-length" class={labelClass}> Initials </label>
              <select
                id="favicon-length"
                bind:value={faviconLength}
                disabled={!!selectedFaviconUrl}
                class={fieldClass}
              >
                <option value={1}>1 letter</option>
                <option value={2}>2 letters</option>
              </select>
            </div>

            <div>
              <label for="favicon-rounded" class={labelClass}> Shape </label>
              <select
                id="favicon-rounded"
                bind:value={faviconRounded}
                disabled={!!selectedFaviconUrl}
                class={fieldClass}
              >
                <option value={false}>Square</option>
                <option value={true}>Circle</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      <div class="flex items-center gap-4">
        <button
          type="button"
          onclick={handleGenerateFavicon}
          disabled={isGenerating}
          class="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {#if isGenerating}
            Generating...
          {:else}
            Generate Favicon
          {/if}
        </button>

        {#if faviconGenerated}
          <span class="flex items-center gap-1.5 text-sm text-emerald-400">
            <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M5 13l4 4L19 7"
              />
            </svg>
            Favicon generated
          </span>
        {/if}
      </div>

      {#if faviconGenerated}
        {#key faviconCacheBust}
          <div class="flex items-center gap-4 rounded-lg border border-gray-700 bg-gray-800/50 p-4">
            <!-- shrink-0 or the previews collapse below their own width and
                   the icons spill under the text beside them. -->
            <div class="flex shrink-0 gap-2">
              <img
                src="/favicon-32.png?v={faviconCacheBust}"
                alt="Favicon 32x32"
                class="h-8 w-8 rounded"
              />
              <img
                src="/icon-192.png?v={faviconCacheBust}"
                alt="Icon 192x192"
                class="h-8 w-8 rounded"
              />
            </div>
            <div class="min-w-0 text-sm text-gray-400">
              <p>Generated files: favicon.ico, apple-touch-icon.png, icon-192.png, icon-512.png</p>
              <p class="text-xs text-gray-500">PWA manifest available at /manifest.json</p>
            </div>
          </div>
        {/key}
      {/if}
    </div>
  </SectionCard>
</div>
