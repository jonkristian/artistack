<script lang="ts">
	interface Props {
		value: string;
		onchange: (value: string) => void;
		id?: string;
		name?: string;
		required?: boolean;
		label?: string;
	}

	let {
		value,
		onchange,
		id = 'email',
		name = 'email',
		required = false,
		label = 'Email'
	}: Props = $props();

	const isValidEmail = $derived(
		value.length === 0 || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
	);
	const showError = $derived(value.length > 0 && !isValidEmail);
</script>

<div>
	<label for={id} class="mb-1 block text-sm text-gray-400">{label}</label>
	<div class="relative">
		<input
			type="email"
			{id}
			{name}
			{value}
			{required}
			oninput={(e) => onchange(e.currentTarget.value)}
			placeholder="you@example.com"
			class="w-full rounded-lg border {showError ? 'border-red-500' : 'border-gray-600'} bg-gray-800 px-3 py-2 pr-10 text-sm text-white placeholder-gray-500 focus:border-gray-500 focus:outline-none"
		/>
		{#if value.length > 0}
			<span class="absolute right-3 top-1/2 -translate-y-1/2">
				{#if isValidEmail}
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
	<p class="mt-1 h-4 text-xs text-red-400 {showError ? 'opacity-100' : 'opacity-0'}">
		Please enter a valid email address
	</p>
</div>
