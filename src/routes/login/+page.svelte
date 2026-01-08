<script lang="ts">
	import { authClient } from '$lib/auth-client';
	import { goto } from '$app/navigation';
	import { enhance } from '$app/forms';
	import PasswordFields from '$lib/components/ui/PasswordFields.svelte';
	import EmailField from '$lib/components/ui/EmailField.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let email = $state('');
	let password = $state('');
	let confirmPassword = $state('');
	let name = $state('');
	let loading = $state(false);
	let errorMsg = $state('');

	const passwordsValid = $derived(
		password.length >= 8 && password === confirmPassword
	);

	// Show setup form if no users exist
	const isSetup = $derived(data.allowSignUp);

	async function handleSignIn(e: SubmitEvent) {
		e.preventDefault();
		loading = true;
		errorMsg = '';

		try {
			const { error } = await authClient.signIn.email({
				email,
				password
			});
			if (error) {
				errorMsg = error.message ?? 'Sign in failed';
				return;
			}
			goto('/admin');
		} catch (err) {
			errorMsg = 'An error occurred';
		} finally {
			loading = false;
		}
	}
</script>

<main class="relative flex min-h-screen items-center justify-center bg-gray-950 px-4">
	<!-- Grain overlay -->
	<div class="pointer-events-none fixed inset-0 z-50 opacity-[0.04]" style="background-image: url('data:image/svg+xml,%3Csvg viewBox=%220 0 512 512%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noise%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%222%22 numOctaves=%224%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noise)%22/%3E%3C/svg%3E');"></div>

	<div class="w-full max-w-sm">
		<!-- Logo with glow -->
		<div class="mb-8 flex justify-center">
			<div class="relative">
				<div class="absolute -inset-8 bg-violet-500/15 blur-2xl rounded-full"></div>
				<img src="/assets/logo.svg" alt="Artistack" class="relative h-10" />
			</div>
		</div>

		<!-- Card -->
		<div class="relative rounded-3xl bg-gray-900 p-8 shadow-2xl ring-1 ring-white/10">
			<h1 class="mb-6 text-center text-2xl font-bold text-white">
				{isSetup ? 'Create Admin Account' : 'Welcome Back'}
			</h1>

		{#if isSetup}
			<!-- Initial setup form -->
			<form
				method="POST"
				action="?/setup"
				use:enhance={() => {
					loading = true;
					errorMsg = '';
					return async ({ result }) => {
						loading = false;
						if (result.type === 'failure') {
							errorMsg = (result.data as { error?: string })?.error ?? 'Setup failed';
						} else if (result.type === 'success') {
							// Sign in after successful setup
							const { error } = await authClient.signIn.email({ email, password });
							if (error) {
								errorMsg = 'Account created. Please sign in.';
								data.allowSignUp = false;
							} else {
								goto('/admin');
							}
						}
					};
				}}
				class="space-y-4"
			>
				<div>
					<label for="name" class="mb-1 block text-sm text-gray-400">Name</label>
					<input
						type="text"
						id="name"
						name="name"
						bind:value={name}
						class="w-full rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-gray-500 focus:outline-none"
						placeholder="Your name"
					/>
				</div>

				<EmailField
					value={email}
					onchange={(v) => (email = v)}
					name="email"
					required
				/>

				<div>
					<PasswordFields
						newPassword={password}
						{confirmPassword}
						onNewPasswordChange={(v) => (password = v)}
						onConfirmPasswordChange={(v) => (confirmPassword = v)}
					/>
					<input type="hidden" name="password" value={password} />
				</div>

				{#if errorMsg}
					<div class="rounded-lg bg-red-900/50 p-3 text-sm text-red-300">
						{errorMsg}
					</div>
				{/if}

				<button
					type="submit"
					disabled={loading || !passwordsValid}
					class="w-full cursor-pointer rounded-lg bg-white/10 px-3 py-2.5 text-sm font-medium text-white transition-colors hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-50"
				>
					{loading ? 'Creating...' : 'Create Admin Account'}
				</button>
			</form>

			<p class="mt-6 text-center text-sm text-gray-500">
				This will be the first admin account for your site.
			</p>
		{:else}
			<!-- Sign in form -->
			<form onsubmit={handleSignIn} class="space-y-4">
				<EmailField
					value={email}
					onchange={(v) => (email = v)}
					required
				/>

				<div>
					<label for="signin-password" class="mb-1 block text-sm text-gray-400">Password</label>
					<input
						type="password"
						id="signin-password"
						bind:value={password}
						required
						minlength="8"
						class="w-full rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-gray-500 focus:outline-none"
						placeholder="••••••••"
					/>
				</div>

				{#if errorMsg}
					<div class="rounded-lg bg-red-900/50 p-3 text-sm text-red-300">
						{errorMsg}
					</div>
				{/if}

				<button
					type="submit"
					disabled={loading}
					class="w-full cursor-pointer rounded-lg bg-white/10 px-3 py-2.5 text-sm font-medium text-white transition-colors hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-50"
				>
					{loading ? 'Signing in...' : 'Sign In'}
				</button>
			</form>
		{/if}
		</div>

		<!-- Back link outside card -->
		<div class="mt-6 text-center">
			<a href="/" class="text-sm text-gray-500 hover:text-gray-400">Back to site</a>
		</div>
	</div>
</main>
