<script lang="ts">
	interface Props {
		newPassword: string;
		confirmPassword: string;
		onNewPasswordChange: (value: string) => void;
		onConfirmPasswordChange: (value: string) => void;
		error?: string;
		minLength?: number;
		label?: string;
	}

	let {
		newPassword,
		confirmPassword,
		onNewPasswordChange,
		onConfirmPasswordChange,
		error = '',
		minLength = 8,
		label = 'Password'
	}: Props = $props();

	const passwordsMatch = $derived(
		newPassword.length > 0 && confirmPassword.length > 0 && newPassword === confirmPassword
	);
	const passwordsDontMatch = $derived(
		confirmPassword.length > 0 && newPassword !== confirmPassword
	);
	const meetsMinLength = $derived(newPassword.length >= minLength);
	const showLengthWarning = $derived(newPassword.length > 0 && !meetsMinLength);
</script>

<div class="space-y-2">
	{#if label}
		<span class="block text-sm text-gray-400">{label}</span>
	{/if}
	<div>
		<div class="relative">
			<input
				type="password"
				value={newPassword}
				oninput={(e) => onNewPasswordChange(e.currentTarget.value)}
				placeholder="New Password"
				class="w-full rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 pr-10 text-sm text-white placeholder-gray-500 focus:border-gray-500 focus:outline-none"
			/>
			{#if newPassword.length > 0}
				<span class="absolute right-3 top-1/2 -translate-y-1/2 text-xs {meetsMinLength ? 'text-green-400' : 'text-gray-500'}">
					{newPassword.length}/{minLength}
				</span>
			{/if}
		</div>
		<p class="mt-1 h-4 text-xs text-amber-400 {showLengthWarning ? 'opacity-100' : 'opacity-0'}">
			Minimum {minLength} characters
		</p>
	</div>

	<div>
		<div class="relative">
			<input
				type="password"
				value={confirmPassword}
				oninput={(e) => onConfirmPasswordChange(e.currentTarget.value)}
				placeholder="Confirm Password"
				class="w-full rounded-lg border {passwordsDontMatch ? 'border-red-500' : passwordsMatch ? 'border-green-500' : 'border-gray-600'} bg-gray-800 px-3 py-2 pr-10 text-sm text-white placeholder-gray-500 focus:outline-none"
			/>
			{#if confirmPassword.length > 0}
				<span class="absolute right-3 top-1/2 -translate-y-1/2">
					{#if passwordsMatch}
						<svg class="h-4 w-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
						</svg>
					{:else}
						<svg class="h-4 w-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
						</svg>
					{/if}
				</span>
			{/if}
		</div>
		<p class="mt-1 h-4 text-xs text-red-400 {passwordsDontMatch ? 'opacity-100' : 'opacity-0'}">
			Passwords do not match
		</p>
	</div>

	{#if error}
		<p class="text-xs text-red-400">{error}</p>
	{/if}
</div>
