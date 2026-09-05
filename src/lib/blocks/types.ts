import type { Component } from 'svelte';
import type { BlockType } from './kinds';
import type {
  Block,
  Profile,
  PublicSettings,
  Link,
  Show,
  Media,
  ProductWithTags,
  ReleaseSummary,
  ProfileBlockConfig,
  LinksBlockConfig,
  ShowsBlockConfig,
  GalleryBlockConfig,
  ImageBlockConfig,
  ProductsBlockConfig,
  ReleasesBlockConfig,
  EmailBlockConfig
} from '$lib/server/schema';

export interface BlockComponentProps {
  block: Block;
  profile: Profile;
  settings?: PublicSettings | null;
  links: Link[];
  shows: Show[];
  media: Media[];
  products?: ProductWithTags[];
  /** The site's records, for a releases block. */
  releases?: ReleaseSummary[];
  locale: string;
}

export interface BlockDefinition {
  /** Its key in the registry, and what gets stored on the row. */
  type: BlockType;
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
  requiresFeature?: 'clipsEnabled' | 'releasesEnabled' | 'subscribersEnabled' | 'shopEnabled';
  defaultConfig:
    | ProfileBlockConfig
    | LinksBlockConfig
    | ShowsBlockConfig
    | GalleryBlockConfig
    | ImageBlockConfig
    | ProductsBlockConfig
    | ReleasesBlockConfig
    | EmailBlockConfig;
}

export type {
  ProfileBlockConfig,
  LinksBlockConfig,
  ShowsBlockConfig,
  GalleryBlockConfig,
  ImageBlockConfig,
  ProductsBlockConfig,
  ReleasesBlockConfig,
  EmailBlockConfig
};
