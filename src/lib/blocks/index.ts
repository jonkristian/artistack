import type { BlockDefinition } from './types';
import ProfileBlock from './profile/ProfileBlock.svelte';
import ProfileBlockAdmin from './profile/ProfileBlockAdmin.svelte';
import ProfileBlockSettings from './profile/ProfileBlockSettings.svelte';
import LinksBlock from './links/LinksBlock.svelte';
import LinksBlockAdmin from './links/LinksBlockAdmin.svelte';
import LinksBlockSettings from './links/LinksBlockSettings.svelte';
import TourDatesBlock from './tour-dates/TourDatesBlock.svelte';
import TourDatesBlockAdmin from './tour-dates/TourDatesBlockAdmin.svelte';
import TourDatesBlockSettings from './tour-dates/TourDatesBlockSettings.svelte';
import GalleryBlock from './gallery/GalleryBlock.svelte';
import GalleryBlockAdmin from './gallery/GalleryBlockAdmin.svelte';
import GalleryBlockSettings from './gallery/GalleryBlockSettings.svelte';
import ImageBlock from './image/ImageBlock.svelte';
import ImageBlockAdmin from './image/ImageBlockAdmin.svelte';
import ImageBlockSettings from './image/ImageBlockSettings.svelte';

export const blockRegistry: Record<string, BlockDefinition> = {
  profile: {
    type: 'profile',
    name: 'Profile',
    icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z',
    component: ProfileBlock,
    adminComponent: ProfileBlockAdmin,
    adminSettingsComponent: ProfileBlockSettings,
    defaultLabel: 'Profile',
    defaultConfig: {
      showName: true,
      showBio: true
    }
  },
  links: {
    type: 'links',
    name: 'Links',
    icon: 'M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1',
    component: LinksBlock,
    adminComponent: LinksBlockAdmin,
    adminSettingsComponent: LinksBlockSettings,
    defaultLabel: 'Links',
    defaultConfig: { displayAs: 'rows' as const }
  },
  tour_dates: {
    type: 'tour_dates',
    name: 'Tour Dates',
    icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
    component: TourDatesBlock,
    adminComponent: TourDatesBlockAdmin,
    adminSettingsComponent: TourDatesBlockSettings,
    defaultLabel: 'Tour Dates',
    defaultConfig: {
      showPastShows: true
    }
  },
  image: {
    type: 'image',
    name: 'Image',
    icon: 'M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z',
    component: ImageBlock,
    adminComponent: ImageBlockAdmin,
    adminSettingsComponent: ImageBlockSettings,
    defaultLabel: 'Image',
    defaultConfig: {
      shape: 'rounded' as const,
      alignment: 'center' as const,
      size: 'medium' as const,
      showGlow: false
    }
  },
  gallery: {
    type: 'gallery',
    name: 'Gallery',
    icon: 'M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z',
    component: GalleryBlock,
    adminComponent: GalleryBlockAdmin,
    adminSettingsComponent: GalleryBlockSettings,
    defaultLabel: 'Gallery',
    defaultConfig: {
      mediaIds: [],
      displayAs: 'grid' as const
    }
  }
};
