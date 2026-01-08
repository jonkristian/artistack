<script lang="ts">
	import { invalidateAll } from '$app/navigation';

	interface Props {
		value: string;
		field: string;
		multiline?: boolean;
		class?: string;
		placeholder?: string;
	}

	let { value, field, multiline = false, class: className = '', placeholder = 'Click to edit...' }: Props = $props();

	let isEditing = $state(false);
	let editValue = $state('');
	let saving = $state(false);

	// Sync editValue when value prop changes (if not currently editing)
	$effect(() => {
		if (!isEditing) {
			editValue = value;
		}
	});

	async function save() {
		if (editValue === value) {
			isEditing = false;
			return;
		}

		saving = true;
		try {
			const res = await fetch('/api/profile', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ [field]: editValue })
			});

			if (res.ok) {
				await invalidateAll();
			}
		} finally {
			saving = false;
			isEditing = false;
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !multiline) {
			e.preventDefault();
			save();
		}
		if (e.key === 'Escape') {
			editValue = value;
			isEditing = false;
		}
	}

	function startEdit() {
		editValue = value;
		isEditing = true;
	}
</script>

{#if isEditing}
	{#if multiline}
		<textarea
			bind:value={editValue}
			onblur={save}
			onkeydown={handleKeydown}
			class="w-full resize-none rounded border border-gray-600 bg-transparent p-2 focus:border-[var(--theme-primary)] focus:outline-none {className}"
			rows="3"
			disabled={saving}
		></textarea>
	{:else}
		<input
			type="text"
			bind:value={editValue}
			onblur={save}
			onkeydown={handleKeydown}
			class="w-full rounded border border-gray-600 bg-transparent p-1 text-center focus:border-[var(--theme-primary)] focus:outline-none {className}"
			disabled={saving}
		/>
	{/if}
{:else}
	<button
		onclick={startEdit}
		class="cursor-pointer rounded px-2 py-1 transition-colors hover:bg-white/10 {className}"
		title="Click to edit"
	>
		{value || placeholder}
	</button>
{/if}
