import type { Component } from 'svelte';
import type {
	Block,
	Profile,
	Settings,
	Link,
	TourDate,
	Media,
	ProfileBlockConfig,
	LinksBlockConfig,
	TourDatesBlockConfig,
	ImagesBlockConfig
} from '$lib/server/schema';

export interface BlockComponentProps {
	block: Block;
	profile: Profile;
	settings?: Settings | null;
	links: Link[];
	tourDates: TourDate[];
	media: Media[];
	locale: string;
}

export interface BlockDefinition {
	type: string;
	name: string;
	icon: string;
	component: Component<BlockComponentProps>;
	adminComponent: Component<any>;
	adminSettingsComponent?: Component<any>;
	defaultLabel: string;
	defaultConfig: ProfileBlockConfig | LinksBlockConfig | TourDatesBlockConfig | ImagesBlockConfig;
}

export type {
	ProfileBlockConfig,
	LinksBlockConfig,
	TourDatesBlockConfig,
	ImagesBlockConfig
};
