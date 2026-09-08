import type { Enhancement, EnhancementContext } from '@/src/schoology/lifecycle';
import type { ThemeMode } from '@/src/types/settings';
import { log } from '@/src/utils/log';

/**
 * Dark mode (Level 1: CSS only).
 *
 * No `filter: invert()`. That trick wrecks images, inverts brand colors and
 * makes the whole page feel wrong; instead a small set of CSS custom properties
 * is defined on `<html>` and scoped overrides map documented Schoology shell
 * elements onto them (see `entrypoints/content/style.css`).
 *
 * Two attributes are written:
 *   data-better-schoology-theme  the student's raw choice, for debugging
 *   data-bs-dark                 present only when dark is actually in effect
 *
 * Keeping the resolved state in its own attribute is what lets `system` react
 * to an OS theme change live, without a page reload and without duplicating
 * every rule inside a media query.
 */
export const THEME_ATTR = 'data-better-schoology-theme';
export const DARK_ATTR = 'data-bs-dark';

export function resolveIsDark(mode: ThemeMode, prefersDark: boolean): boolean {
  if (mode === 'dark') return true;
  if (mode === 'light') return false;
  return prefersDark;
}

export function applyTheme(doc: Document, mode: ThemeMode, prefersDark: boolean): void {
  const root = doc.documentElement;
  if (!root) return;

  root.setAttribute(THEME_ATTR, mode);

  if (resolveIsDark(mode, prefersDark)) root.setAttribute(DARK_ATTR, '');
  else root.removeAttribute(DARK_ATTR);
}

export function clearTheme(doc: Document): void {
  const root = doc.documentElement;
  if (!root) return;
  root.removeAttribute(THEME_ATTR);
  root.removeAttribute(DARK_ATTR);
}

function prefersDarkNow(doc: Document): boolean {
  const win = doc.defaultView;
  if (!win?.matchMedia) return false;
  return win.matchMedia('(prefers-color-scheme: dark)').matches;
}

/**
 * Watches the OS colour-scheme preference.
 *
 * Registered once per document. Returns an unsubscribe function, though in a
 * content script the listener simply lives as long as the page does.
 */
export function watchColorScheme(doc: Document, onChange: () => void): () => void {
  const win = doc.defaultView;
  if (!win?.matchMedia) return () => {};

  const query = win.matchMedia('(prefers-color-scheme: dark)');
  const handler = (): void => onChange();

  query.addEventListener('change', handler);
  return () => query.removeEventListener('change', handler);
}

export const themeEnhancement: Enhancement = {
  id: 'theme',

  // The theme layer is always active while the extension is enabled; `system`
  // in a light environment simply resolves to "no dark attribute".
  appliesTo: () => true,

  apply(context: EnhancementContext) {
    const { theme } = context.state.settings;
    applyTheme(context.document, theme, prefersDarkNow(context.document));
    log.info('theme applied:', theme);
  },

  revert(context: EnhancementContext) {
    clearTheme(context.document);
  },
};
