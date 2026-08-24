<script lang="ts">
  import { enhance } from '$app/forms';
  import PasswordFields from '$lib/components/ui/PasswordFields.svelte';
  import type { ActionData, PageData } from './$types';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  let password = $state('');
  let confirmPassword = $state('');
  let saving = $state(false);

  const valid = $derived(password.length >= 8 && password === confirmPassword);
</script>

<svelte:head>
  <title>Set your password</title>
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

<main class="relative flex min-h-screen items-center justify-center bg-gray-950 px-4">
  <div
    class="pointer-events-none fixed inset-0 z-50 opacity-[0.04]"
    style="background-image: url('data:image/svg+xml,%3Csvg viewBox=%220 0 512 512%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noise%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%222%22 numOctaves=%224%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noise)%22/%3E%3C/svg%3E');"
  ></div>

  <div class="w-full max-w-sm">
    <div class="mb-8 flex justify-center">
      <div class="relative">
        <div class="absolute -inset-8 rounded-full bg-violet-500/15 blur-2xl"></div>
        <img src="/assets/logo.svg" alt="Artistack" class="relative h-10" />
      </div>
    </div>

    <div class="relative rounded-3xl bg-gray-900 p-8 shadow-2xl ring-1 ring-white/10">
      {#if data.valid}
        <h1 class="mb-1 text-center text-2xl font-bold text-white">Welcome, {data.name}</h1>
        <p class="mb-6 text-center text-sm text-gray-400">
          Pick a password and your account is ready.
        </p>

        <form
          method="POST"
          use:enhance={() => {
            saving = true;
            return async ({ update }) => {
              saving = false;
              await update();
            };
          }}
          class="space-y-4"
        >
          <!-- Shown, not editable: the invite is tied to this address, and a
               field they can change would suggest otherwise. -->
          <div>
            <span class="mb-1 block text-sm text-gray-400">Email</span>
            <p
              class="rounded-lg border border-gray-800 bg-gray-800/50 px-3 py-2 text-sm text-gray-300"
            >
              {data.email}
            </p>
          </div>

          <PasswordFields
            newPassword={password}
            {confirmPassword}
            onNewPasswordChange={(v) => (password = v)}
            onConfirmPasswordChange={(v) => (confirmPassword = v)}
            label="Password"
          />
          <input type="hidden" name="password" value={password} />
          <input type="hidden" name="confirmPassword" value={confirmPassword} />

          {#if form?.error}
            <div class="rounded-lg bg-red-900/50 p-3 text-sm text-red-300">{form.error}</div>
          {/if}

          <button
            type="submit"
            disabled={saving || !valid}
            class="w-full cursor-pointer rounded-lg px-3 py-2.5 text-sm font-medium text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50 {valid
              ? 'bg-violet-600 hover:bg-violet-500'
              : 'bg-white/10 hover:bg-white/20'}"
          >
            {saving ? 'Saving…' : 'Set password'}
          </button>
        </form>
      {:else}
        <h1 class="mb-2 text-center text-2xl font-bold text-white">Invitation expired</h1>
        <p class="text-center text-sm text-gray-400">
          This link has already been used or has run out. Ask for a new one and it'll arrive in your
          inbox.
        </p>
        <a
          href="/login"
          class="mt-6 block rounded-lg bg-white/10 px-3 py-2.5 text-center text-sm font-medium text-white transition-colors hover:bg-white/20"
        >
          Go to sign in
        </a>
      {/if}
    </div>

    <div class="mt-6 text-center">
      <a href="/" class="text-sm text-gray-500 hover:text-gray-400">Back to site</a>
    </div>
  </div>
</main>
