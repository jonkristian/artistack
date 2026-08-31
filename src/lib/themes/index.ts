import Default from './Default.svelte';
import Simple from './Simple.svelte';

/**
 * The layouts a site can be rendered with.
 *
 * One registry, because the same choice is made in four places — the public
 * page, a custom page, the page editor's preview and the appearance preview —
 * and a layout that exists in some of them and not others is the kind of thing
 * nobody notices until a preview disagrees with the page it's previewing.
 */
export const themes = { default: Default, simple: Simple } as const;

export type ThemeName = keyof typeof themes;

export function resolveTheme(name?: string | null) {
  return themes[(name as ThemeName) ?? 'default'] ?? Default;
}
