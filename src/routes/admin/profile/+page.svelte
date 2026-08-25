<script lang="ts">
  import { fieldClass } from '$lib/utils/classes';
  import { SectionCard } from '$lib/components/cards';
  import { PasswordFields } from '$lib/components/ui';
  import { invalidateAll } from '$app/navigation';
  import { toast } from '$lib/stores/toast.svelte';
  import { updateOwnProfile, changeOwnPassword } from '$lib/profile.remote';
  import { untrack } from 'svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  const currentUser = $derived(data.user);

  // Seeded once on purpose: after a save the load data changes, and a field
  // that re-derived would fight whatever is being typed into it.
  let name = $state(untrack(() => data.user.name) ?? '');
  let email = $state(untrack(() => data.user.email) ?? '');
  let savingProfile = $state(false);
  let profileError = $state('');

  let currentPassword = $state('');
  let newPassword = $state('');
  let confirmPassword = $state('');
  let savingPassword = $state(false);
  let passwordError = $state('');

  const profileChanged = $derived(name !== currentUser.name || email !== currentUser.email);
  const passwordReady = $derived(
    currentPassword.length > 0 && newPassword.length >= 8 && newPassword === confirmPassword
  );

  async function saveProfile() {
    profileError = '';
    savingProfile = true;
    try {
      await updateOwnProfile({ name, email });
      await invalidateAll();
      toast.success('Profile updated');
    } catch (e) {
      profileError = e instanceof Error ? e.message : 'Could not save';
    } finally {
      savingProfile = false;
    }
  }

  async function savePassword() {
    passwordError = '';
    savingPassword = true;
    try {
      const result = await changeOwnPassword({ currentPassword, newPassword, confirmPassword });
      if (!result.success) {
        passwordError = result.reason;
        return;
      }
      currentPassword = '';
      newPassword = '';
      confirmPassword = '';
      toast.success('Password changed');
    } catch (e) {
      passwordError = e instanceof Error ? e.message : 'Could not change password';
    } finally {
      savingPassword = false;
    }
  }
</script>

<div class="min-h-screen bg-gray-950 p-[clamp(1rem,4vw,1.5rem)]">
  <div class="max-w-2xl space-y-6">
    <SectionCard>
      <!-- Always editable rather than a view with an Edit button: this page
           exists to change these three things, so there's nothing to reveal. -->
      <div class="mb-4 flex items-center gap-3">
        {#if currentUser.image}
          <img src={currentUser.image} alt="" class="h-12 w-12 rounded-full object-cover" />
        {:else}
          <div
            class="flex h-12 w-12 items-center justify-center rounded-full bg-gray-700 text-lg font-medium text-gray-300"
          >
            {(currentUser.name ?? '?').charAt(0).toUpperCase()}
          </div>
        {/if}
        <div>
          <p class="font-medium text-white">{currentUser.name}</p>
          <p class="text-xs text-gray-500">
            {currentUser.role === 'admin' ? 'Admin' : 'Editor'}
          </p>
        </div>
      </div>

      <div class="space-y-3">
        <div>
          <label class="mb-1 block text-sm text-gray-400" for="profile-name">Name</label>
          <input id="profile-name" bind:value={name} class={fieldClass} />
        </div>
        <div>
          <label class="mb-1 block text-sm text-gray-400" for="profile-email">Email</label>
          <input id="profile-email" type="email" bind:value={email} class={fieldClass} />
          <p class="mt-1 text-xs text-gray-600">This is what you sign in with.</p>
        </div>

        {#if profileError}
          <p class="text-xs text-red-400">{profileError}</p>
        {/if}

        <div class="flex justify-end">
          <button
            onclick={saveProfile}
            disabled={savingProfile || !profileChanged || !name || !email}
            class="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {savingProfile ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </SectionCard>

    <SectionCard>
      <h2 class="mb-4 text-sm font-medium tracking-wider text-gray-400 uppercase">Password</h2>

      <div class="space-y-3">
        <div>
          <label class="mb-1 block text-sm text-gray-400" for="current-password">
            Current password
          </label>
          <input
            id="current-password"
            type="password"
            bind:value={currentPassword}
            autocomplete="current-password"
            class={fieldClass}
          />
        </div>

        <PasswordFields
          {newPassword}
          {confirmPassword}
          onNewPasswordChange={(v) => (newPassword = v)}
          onConfirmPasswordChange={(v) => (confirmPassword = v)}
          label="New password"
        />

        {#if passwordError}
          <p class="text-xs text-red-400">{passwordError}</p>
        {/if}

        <div class="flex justify-end">
          <button
            onclick={savePassword}
            disabled={savingPassword || !passwordReady}
            class="rounded-lg bg-white/10 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {savingPassword ? 'Changing…' : 'Change password'}
          </button>
        </div>
      </div>
    </SectionCard>
  </div>
</div>
