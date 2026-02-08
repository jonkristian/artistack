import type { Component } from 'svelte';
import type {
  Block,
  Profile,
  Settings,
  Link,
  TourDate,
  Media,
  Product,
  ProfileBlockConfig,
  LinksBlockConfig,
  TourDatesBlockConfig,
  GalleryBlockConfig,
  ImageBlockConfig,
  ProductsBlockConfig
} from '$lib/server/schema';

export interface BlockComponentProps {
  block: Block;
  profile: Profile;
  settings?: Settings | null;
  links: Link[];
  tourDates: TourDate[];
  media: Media[];
  products?: Product[];
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
  defaultConfig:
    | ProfileBlockConfig
    | LinksBlockConfig
    | TourDatesBlockConfig
    | GalleryBlockConfig
    | ImageBlockConfig
    | ProductsBlockConfig;
}

export type {
  ProfileBlockConfig,
  LinksBlockConfig,
  TourDatesBlockConfig,
  GalleryBlockConfig,
  ImageBlockConfig,
  ProductsBlockConfig
};
