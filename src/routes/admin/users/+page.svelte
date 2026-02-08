<script lang="ts">
  import { SectionCard } from '$lib/components/cards';
  import { PasswordFields } from '$lib/components/ui';
  import { invalidateAll } from '$app/navigation';
  import type { PageData } from './$types';
  import {
    addUser,
    updateUser,
    deleteUser,
    updateOwnProfile,
    changePassword,
    resetPassword
  } from './users.remote.js';

  let { data }: { data: PageData } = $props();

  // Current user from parent layout
  const currentUser = $derived(data.user);
  const isAdmin = $derived(currentUser?.role === 'admin');

  // Add user form
  let showAddForm = $state(false);
  const addForm = addUser.for('add-user');

  // Edit user state
  let editingUserId = $state<string | null>(null);
  let editName = $state('');
  let editEmail = $state('');
  let editRole = $state<'admin' | 'editor'>('editor');

  // Reset password state (used when editing a user)
  let resetNewPassword = $state('');
  let resetConfirmPassword = $state('');
  let resetPasswordError = $state('');

  // Own profile edit
  let editingOwnProfile = $state(false);
  let ownName = $state('');
  let ownEmail = $state('');
  let ownCurrentPassword = $state('');
  let ownNewPassword = $state('');
  let ownConfirmPassword = $state('');
  let ownProfileError = $state('');
  let ownProfileSaving = $state(false);

  function startEditOwnProfile() {
    ownName = currentUser?.name ?? '';
    ownEmail = currentUser?.email ?? '';
    ownCurrentPassword = '';
    ownNewPassword = '';
    ownConfirmPassword = '';
    ownProfileError = '';
    editingOwnProfile = true;
  }

  function cancelOwnProfileEdit() {
    editingOwnProfile = false;
    ownProfileError = '';
  }

  async function saveOwnProfile() {
    ownProfileError = '';

    // Validate password if any password field is filled
    if (ownCurrentPassword || ownNewPassword || ownConfirmPassword) {
      if (!ownCurrentPassword) {
        ownProfileError = 'Current password is required to change password';
        return;
      }
      if (ownNewPassword.length < 8) {
        ownProfileError = 'New password must be at least 8 characters';
        return;
      }
      if (ownNewPassword !== ownConfirmPassword) {
        ownProfileError = 'New passwords do not match';
        return;
      }
    }

    ownProfileSaving = true;
    try {
      // Update profile
      await updateOwnProfile({
        userId: currentUser?.id ?? '',
        name: ownName,
        email: ownEmail
      });

      // Change password if provided
      if (ownCurrentPassword && ownNewPassword) {
        await changePassword({
          userId: currentUser?.id ?? '',
          currentPassword: ownCurrentPassword,
          newPassword: ownNewPassword,
          confirmPassword: ownConfirmPassword
        });
      }

      editingOwnProfile = false;
      await invalidateAll();
    } catch (e) {
      ownProfileError = e instanceof Error ? e.message : 'Failed to save';
    } finally {
      ownProfileSaving = false;
    }
  }

  function startEditUser(u: (typeof data.users)[0]) {
    editingUserId = u.id;
    editName = u.name;
    editEmail = u.email;
    editRole = (u.role as 'admin' | 'editor') || 'editor';
  }

  function cancelEdit() {
    editingUserId = null;
    resetNewPassword = '';
    resetConfirmPassword = '';
    resetPasswordError = '';
  }

  async function saveUserEdit(id: string) {
    resetPasswordError = '';

    // Validate password if provided
    if (resetNewPassword || resetConfirmPassword) {
      if (resetNewPassword.length < 8) {
        resetPasswordError = 'Password must be at least 8 characters';
        return;
      }
      if (resetNewPassword !== resetConfirmPassword) {
        resetPasswordError = 'Passwords do not match';
        return;
      }
    }

    try {
      // Update user details
      await updateUser({
        id,
        name: editName,
        email: editEmail,
        role: editRole
      });

      // Reset password if provided
      if (resetNewPassword && resetNewPassword === resetConfirmPassword) {
        await resetPassword({
          userId: id,
          adminId: currentUser?.id ?? '',
          newPassword: resetNewPassword,
          confirmPassword: resetConfirmPassword
        });
      }

      editingUserId = null;
      resetNewPassword = '';
      resetConfirmPassword = '';
      await invalidateAll();
    } catch (e) {
      resetPasswordError = e instanceof Error ? e.message : 'Failed to save';
    }
  }

  async function handleDeleteUser(id: string, name: string) {
    if (confirm(`Are you sure you want to remove ${name}? This cannot be undone.`)) {
      await deleteUser({ id, currentUserId: currentUser?.id ?? '' });
      await invalidateAll();
    }
  }

  function getRoleLabel(role: string | null) {
    return role === 'admin' ? 'Admin' : 'Editor';
  }

  function getRoleBadgeClass(role: string | null) {
    return role === 'admin' ? 'bg-violet-500/20 text-violet-400' : 'bg-gray-700/50 text-gray-400';
  }
</script>

<div class="min-h-screen bg-gray-950 p-6">
  <header class="mb-6">
    <h1 class="text-2xl font-semibold text-white">Users</h1>
    <p class="text-sm text-gray-500">Manage collaborators who can edit your content</p>
  </header>

  <div class="max-w-2xl space-y-6">
    <!-- Your Profile -->
    <SectionCard title="Your Profile">
      {#if editingOwnProfile}
        <div class="space-y-3">
          <!-- Name and Email row -->
          <div class="flex items-center gap-2">
            {#if currentUser?.image}
              <img
                src={currentUser.image}
                alt=""
                class="h-10 w-10 shrink-0 rounded-full object-cover"
              />
            {:else}
              <div
                class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-700 text-sm font-medium text-gray-300"
              >
                {currentUser?.name?.charAt(0).toUpperCase() || '?'}
              </div>
            {/if}
            <input
              bind:value={ownName}
              placeholder="Name"
              class="min-w-0 flex-1 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-gray-600 focus:outline-none"
            />
            <input
              bind:value={ownEmail}
              type="email"
              placeholder="Email"
              class="min-w-0 flex-[1.5] rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-gray-600 focus:outline-none"
            />
          </div>

          <!-- Password section -->
          <div class="border-t border-gray-700 pt-3">
            <span class="mb-2 block text-xs text-gray-500"
              >Change password (leave empty to keep current)</span
            >
            <div class="space-y-2">
              <input
                type="password"
                bind:value={ownCurrentPassword}
                placeholder="Current Password"
                class="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-gray-600 focus:outline-none"
              />
              <PasswordFields
                newPassword={ownNewPassword}
                confirmPassword={ownConfirmPassword}
                onNewPasswordChange={(v) => (ownNewPassword = v)}
                onConfirmPasswordChange={(v) => (ownConfirmPassword = v)}
              />
            </div>
          </div>

          {#if ownProfileError}
            <p class="text-xs text-red-400">{ownProfileError}</p>
          {/if}

          <!-- Actions -->
          <div class="flex justify-end gap-2">
            <button
              onclick={cancelOwnProfileEdit}
              class="rounded-lg px-4 py-2 text-sm text-gray-400 hover:text-white"
            >
              Cancel
            </button>
            <button
              onclick={saveOwnProfile}
              disabled={ownProfileSaving}
              class="rounded-lg bg-white/10 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/20 disabled:opacity-50"
            >
              {ownProfileSaving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      {:else}
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            {#if currentUser?.image}
              <img src={currentUser.image} alt="" class="h-10 w-10 rounded-full object-cover" />
            {:else}
              <div
                class="flex h-10 w-10 items-center justify-center rounded-full bg-gray-700 text-sm font-medium text-gray-300"
              >
                {currentUser?.name?.charAt(0).toUpperCase() || '?'}
              </div>
            {/if}
            <div>
              <div class="flex items-center gap-2">
                <span class="font-medium text-white">{currentUser?.name}</span>
                <span
                  class="rounded px-1.5 py-0.5 text-xs {getRoleBadgeClass(
                    currentUser?.role ?? null
                  )}"
                >
                  {getRoleLabel(currentUser?.role ?? null)}
                </span>
              </div>
              <span class="text-sm text-gray-400">{currentUser?.email}</span>
            </div>
          </div>
          <button
            onclick={startEditOwnProfile}
            class="rounded-lg bg-white/10 px-3 py-1.5 text-sm text-white transition-colors hover:bg-white/20"
          >
            Edit
          </button>
        </div>
      {/if}
    </SectionCard>

    <!-- Team Members -->
    <SectionCard>
      <div class="mb-4 flex items-center justify-between">
        <h2 class="text-sm font-medium tracking-wider text-gray-400 uppercase">Team Members</h2>
        {#if isAdmin}
          <button
            onclick={() => (showAddForm = !showAddForm)}
            class="text-sm text-gray-400 hover:text-white"
          >
            {showAddForm ? 'Cancel' : '+ Add'}
          </button>
        {/if}
      </div>

      {#if showAddForm && isAdmin}
        <form
          {...addForm.enhance(async ({ submit }) => {
            try {
              await submit();
              // Only close if no validation errors
              const issues = addForm.fields.allIssues();
              if (!issues || issues.length === 0) {
                showAddForm = false;
                addForm.fields.set({
                  name: '',
                  email: '',
                  password: '',
                  confirmPassword: '',
                  role: 'editor'
                });
                await invalidateAll();
              }
            } catch (e) {
              console.error('Failed to add user:', e);
            }
          })}
          class="mb-4 space-y-3 rounded-lg border border-gray-700 bg-gray-800/50 p-4"
        >
          <div class="grid grid-cols-2 gap-3">
            <div>
              <input
                {...addForm.fields.name.as('text')}
                placeholder="Name"
                class="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-gray-600 focus:outline-none"
              />
            </div>
            <div>
              <input
                {...addForm.fields.email.as('email')}
                placeholder="Email"
                class="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-gray-600 focus:outline-none"
              />
            </div>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <input
                {...addForm.fields.password.as('password')}
                placeholder="Password"
                class="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-gray-600 focus:outline-none"
              />
            </div>
            <div>
              <input
                {...addForm.fields.confirmPassword.as('password')}
                placeholder="Confirm Password"
                class="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-gray-600 focus:outline-none"
              />
            </div>
          </div>
          <div>
            <select
              {...addForm.fields.role.as('text')}
              class="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white focus:border-gray-600 focus:outline-none"
            >
              <option value="editor">Editor</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          {#each addForm.fields.allIssues() as issue, i (i)}
            <p class="text-xs text-red-400">{issue.message}</p>
          {/each}
          <button
            type="submit"
            disabled={!!addForm.pending}
            class="w-full rounded-lg bg-white/10 py-2 text-sm font-medium text-white transition-colors hover:bg-white/20 disabled:opacity-50"
          >
            {addForm.pending ? 'Adding...' : 'Add User'}
          </button>
        </form>
      {/if}

      <div class="space-y-2">
        {#each data.users.filter((u) => u.id !== currentUser?.id) as u (u.id)}
          <div
            class="group rounded-lg bg-gray-800/50 px-4 py-3 transition-colors hover:bg-gray-800"
          >
            {#if editingUserId === u.id && isAdmin}
              <!-- Edit mode -->
              <div class="space-y-3">
                <!-- User info row -->
                <div class="flex items-center gap-2">
                  {#if u.image}
                    <img src={u.image} alt="" class="h-9 w-9 shrink-0 rounded-full object-cover" />
                  {:else}
                    <div
                      class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-700 text-sm font-medium text-gray-300"
                    >
                      {u.name.charAt(0).toUpperCase()}
                    </div>
                  {/if}
                  <input
                    bind:value={editName}
                    placeholder="Name"
                    class="min-w-0 flex-1 rounded-lg border border-gray-700 bg-gray-900 px-3 py-1.5 text-sm text-white focus:border-gray-600 focus:outline-none"
                  />
                  <input
                    bind:value={editEmail}
                    type="email"
                    placeholder="Email"
                    class="min-w-0 flex-[1.5] rounded-lg border border-gray-700 bg-gray-900 px-3 py-1.5 text-sm text-white focus:border-gray-600 focus:outline-none"
                  />
                  <select
                    bind:value={editRole}
                    class="shrink-0 rounded-lg border border-gray-700 bg-gray-900 px-3 py-1.5 text-sm text-white focus:border-gray-600 focus:outline-none"
                  >
                    <option value="editor">Editor</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>

                <!-- Password reset (optional) -->
                <div class="border-t border-gray-700 pt-3">
                  <span class="mb-2 block text-xs text-gray-500"
                    >New password (leave empty to keep current)</span
                  >
                  <PasswordFields
                    newPassword={resetNewPassword}
                    confirmPassword={resetConfirmPassword}
                    onNewPasswordChange={(v) => (resetNewPassword = v)}
                    onConfirmPasswordChange={(v) => (resetConfirmPassword = v)}
                    error={resetPasswordError}
                  />
                </div>

                <!-- Actions -->
                <div class="flex justify-end gap-2">
                  <button
                    onclick={cancelEdit}
                    class="rounded-lg px-3 py-1.5 text-sm text-gray-400 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    onclick={() => saveUserEdit(u.id)}
                    class="rounded-lg bg-white/10 px-3 py-1.5 text-sm text-white transition-colors hover:bg-white/20"
                  >
                    Save
                  </button>
                </div>
              </div>
            {:else}
              <!-- Display mode -->
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-3">
                  {#if u.image}
                    <img src={u.image} alt="" class="h-9 w-9 rounded-full object-cover" />
                  {:else}
                    <div
                      class="flex h-9 w-9 items-center justify-center rounded-full bg-gray-700 text-sm font-medium text-gray-300"
                    >
                      {u.name.charAt(0).toUpperCase()}
                    </div>
                  {/if}
                  <div>
                    <div class="flex items-center gap-2">
                      <span class="text-sm font-medium text-white">{u.name}</span>
                      <span class="rounded px-1.5 py-0.5 text-xs {getRoleBadgeClass(u.role)}">
                        {getRoleLabel(u.role)}
                      </span>
                    </div>
                    <span class="text-xs text-gray-500">{u.email}</span>
                  </div>
                </div>
                {#if isAdmin}
                  <div
                    class="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100"
                  >
                    <button
                      onclick={() => startEditUser(u)}
                      class="rounded p-1.5 text-gray-500 hover:bg-gray-700 hover:text-white"
                      aria-label="Edit user"
                    >
                      <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="2"
                          d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                        />
                      </svg>
                    </button>
                    <button
                      onclick={() => handleDeleteUser(u.id, u.name)}
                      class="rounded p-1.5 text-gray-500 hover:bg-gray-700 hover:text-red-400"
                      aria-label="Remove user"
                    >
                      <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="2"
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                        />
                      </svg>
                    </button>
                  </div>
                {/if}
              </div>
            {/if}
          </div>
        {:else}
          <p class="py-4 text-center text-sm text-gray-600">No other team members yet</p>
        {/each}
      </div>
    </SectionCard>

    <!-- Info about roles -->
    <div class="rounded-lg border border-gray-800 bg-gray-900/50 p-4">
      <h3 class="mb-2 text-sm font-medium text-gray-400">About Roles</h3>
      <ul class="space-y-1 text-xs text-gray-500">
        <li><span class="text-gray-400">Admin:</span> Can manage users and all content</li>
        <li>
          <span class="text-gray-400">Editor:</span> Can edit links, tour dates, and profile content
        </li>
      </ul>
    </div>
  </div>
</div>
