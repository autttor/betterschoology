import type { Enhancement } from '@/src/schoology/lifecycle';
import { clearEnhanced, markEnhanced } from '@/src/schoology/selectors';
import { readHeaderDisplayName, readHeaderPopovers, readNavigationLabels } from '@/src/schoology/adapters/navigation';

const FEATURE = 'navigation-labels';
const POPOVER_ATTR = 'data-bs-native-nav-popover';
interface LabelPatch { node: Text; original: string; applied: string; }
interface NavigationState {
  labels: Map<HTMLElement, LabelPatch>;
  popovers: Set<HTMLElement>;
}
const states = new WeakMap<Document, NavigationState>();

function stateFor(doc: Document): NavigationState {
  let state = states.get(doc);
  if (!state) {
    state = { labels: new Map(), popovers: new Set() };
    states.set(doc, state);
  }
  return state;
}

function originalText(doc: Document, element: HTMLElement, node: Text): string {
  const patch = states.get(doc)?.labels.get(element);
  return patch?.node === node && node.data === patch.applied ? patch.original : node.data;
}

function restore(element: HTMLElement, state: NavigationState): void {
  const patch = state.labels.get(element);
  // If Schoology replaced this node/text meanwhile, its new value takes priority.
  if (patch && element.contains(patch.node) && patch.node.data === patch.applied) {
    patch.node.data = patch.original;
  }
  state.labels.delete(element);
  clearEnhanced(element, FEATURE);
}

function replaceLabel(doc: Document, element: HTMLElement, node: Text, next?: string): void {
  const state = stateFor(doc);
  const value = next?.trim();
  if (!value) { restore(element, state); return; }
  const original = originalText(doc, element, node);
  const patch = state.labels.get(element);
  if (patch?.node === node && patch.applied === value && node.data === value) return;
  state.labels.set(element, { node, original, applied: value });
  node.data = value;
  markEnhanced(element, FEATURE);
}

/** Chosen display name wins; otherwise use only the native account's first name. */
export function getDisplayName(doc: Document, override?: string): string | undefined {
  if (override?.trim()) return override.trim();
  const account = readHeaderDisplayName(doc);
  const name = account && originalText(doc, account.element, account.node).trim();
  return name ? name.split(/\s+/)[0] : undefined;
}

export const navigationEnhancement: Enhancement = {
  id: FEATURE,
  appliesTo: ({ state }) => state.settings.enabled,
  apply({ document: doc, state: { settings } }) {
    const state = stateFor(doc);
    for (const element of state.labels.keys()) {
      if (!element.isConnected) state.labels.delete(element);
    }
    for (const label of readNavigationLabels(doc, (el, node) => originalText(doc, el, node))) {
      replaceLabel(doc, label.element, label.node, settings.navLabels[label.key]);
    }
    const account = readHeaderDisplayName(doc);
    if (account) {
      replaceLabel(doc, account.element, account.node,
        settings.applyDisplayNameToSchoologyHeader ? settings.displayNameOverride : undefined);
    }
    const popovers = new Set(readHeaderPopovers(doc));
    for (const element of state.popovers) {
      if (!popovers.has(element)) element.removeAttribute(POPOVER_ATTR);
    }
    for (const element of popovers) {
      if (!element.hasAttribute(POPOVER_ATTR)) element.setAttribute(POPOVER_ATTR, '');
    }
    state.popovers = popovers;
  },
  revert({ document: doc }) {
    const state = states.get(doc);
    if (!state) return;
    for (const element of state.labels.keys()) restore(element, state);
    for (const element of state.popovers) element.removeAttribute(POPOVER_ATTR);
    states.delete(doc);
  },
};
