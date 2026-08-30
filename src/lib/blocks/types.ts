import type { Component } from 'svelte';
import type {
  Block,
  Profile,
  PublicSettings,
  Link,
  TourDate,
  Media,
  Product,
  ProfileBlockConfig,
  LinksBlockConfig,
  TourDatesBlockConfig,
  GalleryBlockConfig,
  ImageBlockConfig,
  ProductsBlockConfig,
  EmailBlockConfig
} from '$lib/server/schema';

export interface BlockComponentProps {
  block: Block;
  profile: Profile;
  settings?: PublicSettings | null;
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
  /**
   * Only offered when this setting is on. A sign-up block on a site with the
   * fan list switched off is a form that quietly posts into a 404.
   */
  requiresFeature?: 'clipsEnabled' | 'releasesEnabled' | 'subscribersEnabled';
  defaultConfig:
    | ProfileBlockConfig
    | LinksBlockConfig
    | TourDatesBlockConfig
    | GalleryBlockConfig
    | ImageBlockConfig
    | ProductsBlockConfig
    | EmailBlockConfig;
}

export type {
  ProfileBlockConfig,
  LinksBlockConfig,
  TourDatesBlockConfig,
  GalleryBlockConfig,
  ImageBlockConfig,
  ProductsBlockConfig,
  EmailBlockConfig
};
