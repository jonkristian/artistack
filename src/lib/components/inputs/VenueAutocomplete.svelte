<script lang="ts">
	import { onMount } from 'svelte';
	import type { Venue } from '$lib/server/schema';

	interface Props {
		apiKey?: string | null;
		venue: Venue;
		cityBias?: string;
		onchange: (venue: Venue) => void;
	}

	let { apiKey, venue, cityBias, onchange }: Props = $props();

	let suggestions = $state<google.maps.places.AutocompletePrediction[]>([]);
	let showSuggestions = $state(false);
	let autocompleteService: google.maps.places.AutocompleteService | null = null;

	// Load Google Places script on mount
	onMount(() => {
		if (!apiKey) return;

		if (window.google?.maps?.places) {
			autocompleteService = new google.maps.places.AutocompleteService();
		} else {
			const script = document.createElement('script');
			script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
			script.async = true;
			script.onload = () => {
				autocompleteService = new google.maps.places.AutocompleteService();
			};
			document.head.appendChild(script);
		}
	});

	function handleInput(e: Event) {
		const value = (e.target as HTMLInputElement).value;

		// Update venue name immediately
		onchange({ ...venue, name: value });

		if (!autocompleteService || value.length < 2) {
			suggestions = [];
			showSuggestions = false;
			return;
		}

		// Include city in search query for better results
		const searchQuery = cityBias ? `${value} ${cityBias}` : value;

		autocompleteService.getPlacePredictions(
			{
				input: searchQuery,
				types: ['establishment']
			},
			(predictions, status) => {
				if (status === google.maps.places.PlacesServiceStatus.OK && predictions) {
					suggestions = predictions;
					showSuggestions = true;
				} else {
					suggestions = [];
					showSuggestions = false;
				}
			}
		);
	}

	function handleFocus() {
		if (suggestions.length > 0) showSuggestions = true;
	}

	function selectPlace(prediction: google.maps.places.AutocompletePrediction) {
		showSuggestions = false;

		const placesService = new google.maps.places.PlacesService(document.createElement('div'));

		placesService.getDetails(
			{
				placeId: prediction.place_id,
				fields: ['name', 'formatted_address', 'address_components', 'geometry']
			},
			(place, status) => {
				if (status === google.maps.places.PlacesServiceStatus.OK && place) {
					// Extract city from address components
					let city = '';
					const addressComponents = place.address_components || [];
					for (const component of addressComponents) {
						if (component.types.includes('locality')) {
							city = component.long_name;
							break;
						}
						if (component.types.includes('administrative_area_level_2') && !city) {
							city = component.long_name;
						}
						if (component.types.includes('administrative_area_level_1') && !city) {
							city = component.long_name;
						}
					}

					onchange({
						name: place.name || prediction.structured_formatting.main_text,
						city: city,
						address: place.formatted_address,
						placeId: prediction.place_id,
						lat: place.geometry?.location?.lat(),
						lng: place.geometry?.location?.lng()
					});
				}
			}
		);
	}

	function handleBlur() {
		// Delay hiding to allow click on suggestion
		setTimeout(() => {
			showSuggestions = false;
		}, 200);
	}
</script>

<div class="relative">
	<input
		type="text"
		value={venue.name}
		oninput={handleInput}
		onfocus={handleFocus}
		onblur={handleBlur}
		placeholder="Venue name"
		class="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-gray-600 focus:outline-none"
	/>

	{#if showSuggestions && suggestions.length > 0}
		<div class="absolute left-0 right-0 top-full z-50 mt-1 max-h-60 overflow-auto rounded-lg border border-gray-700 bg-gray-800 shadow-xl">
			{#each suggestions as suggestion (suggestion.place_id)}
				<button
					type="button"
					onclick={() => selectPlace(suggestion)}
					class="flex w-full cursor-pointer flex-col px-3 py-2 text-left hover:bg-gray-700"
				>
					<span class="text-sm text-white">{suggestion.structured_formatting.main_text}</span>
					<span class="text-xs text-gray-400">{suggestion.structured_formatting.secondary_text}</span>
				</button>
			{/each}
		</div>
	{/if}
</div>
