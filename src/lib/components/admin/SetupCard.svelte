<script lang="ts">
  import { untrack } from 'svelte';
  import type { Settings } from '$lib/server/schema';

  interface Props {
    settings: Settings | null;
    oncomplete: () => void;
  }

  let { settings, oncomplete }: Props = $props();

  // Form state (capture initial values)
  const initial = untrack(() => settings);
  let siteTitle = $state(initial?.siteTitle ?? '');
  let locale = $state(initial?.locale ?? 'en-US');
  let saving = $state(false);

  const locales = [
    { code: 'en-US', name: 'English (US)' },
    { code: 'en-GB', name: 'English (UK)' },
    { code: 'nb-NO', name: 'Norsk (Bokmål)' },
    { code: 'nn-NO', name: 'Norsk (Nynorsk)' },
    { code: 'sv-SE', name: 'Svenska' },
    { code: 'da-DK', name: 'Dansk' },
    { code: 'de-DE', name: 'Deutsch' },
    { code: 'fr-FR', name: 'Français' },
    { code: 'es-ES', name: 'Español' },
    { code: 'it-IT', name: 'Italiano' },
    { code: 'pt-BR', name: 'Português (Brasil)' },
    { code: 'nl-NL', name: 'Nederlands' },
    { code: 'pl-PL', name: 'Polski' },
    { code: 'ja-JP', name: '日本語' },
    { code: 'ko-KR', name: '한국어' },
    { code: 'zh-CN', name: '中文 (简体)' }
  ];

  async function handleSubmit() {
    saving = true;
    try {
      const { completeSetup } = await import('../../../routes/admin/data.remote');
      await completeSetup({
        siteTitle: siteTitle || undefined,
        locale
      });
      oncomplete();
    } catch (err) {
      console.error('Setup failed:', err);
    } finally {
      saving = false;
    }
  }
</script>

<div
  class="mb-6 overflow-hidden rounded-xl border border-violet-500/30 bg-gradient-to-br from-violet-950/50 to-gray-900"
>
  <div class="border-b border-violet-500/20 bg-violet-500/10 px-6 py-4">
    <h2 class="text-lg font-semibold text-white">Welcome to Artistack</h2>
    <p class="text-sm text-gray-400">Let's set up your page</p>
  </div>

  <div class="space-y-6 p-6">
    <!-- Site Title -->
    <div>
      <label for="setup-title" class="mb-2 block text-sm font-medium text-gray-300"
        >Site Title</label
      >
      <input
        id="setup-title"
        type="text"
        bind:value={siteTitle}
        placeholder="Your name or brand"
        class="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 focus:outline-none"
      />
      <p class="mt-1 text-xs text-gray-500">Shown in browser tab and search results</p>
    </div>

    <!-- Locale -->
    <div>
      <label for="setup-locale" class="mb-2 block text-sm font-medium text-gray-300">Region</label>
      <select
        id="setup-locale"
        bind:value={locale}
        class="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white focus:border-violet-500 focus:ring-1 focus:ring-violet-500 focus:outline-none"
      >
        {#each locales as loc}
          <option value={loc.code}>{loc.name}</option>
        {/each}
      </select>
      <p class="mt-1 text-xs text-gray-500">Affects date formatting and language</p>
    </div>

    <!-- Submit -->
    <button
      onclick={handleSubmit}
      disabled={saving}
      class="w-full rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-500 disabled:opacity-50"
    >
      {saving ? 'Setting up...' : 'Get Started'}
    </button>
  </div>
</div>
