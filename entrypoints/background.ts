import { loadState, saveState } from '@/src/storage';
import { setLoggingEnabled, log } from '@/src/utils/log';

/**
 * Background service worker.
 *
 * Deliberately tiny. Better Schoology has no backend, no analytics and no
 * network activity of its own -- the only Schoology requests made anywhere in
 * the extension are the same-origin fragment reads the content script performs
 * on pages the student is already viewing.
 *
 * It does two things: make sure storage holds a valid, migrated state on
 * install and update, so the popup and content script never race a first
 * write; and open the customizer when a content-script surface asks it to,
 * because `openOptionsPage` is not callable from a content script.
 */
export type BackgroundMessage = { type: 'open-options' };

function isBackgroundMessage(value: unknown): value is BackgroundMessage {
  return typeof value === 'object' && value !== null && (value as { type?: unknown }).type === 'open-options';
}

export default defineBackground(() => {
  setLoggingEnabled(import.meta.env.DEV);

  browser.runtime.onInstalled.addListener(async (details) => {
    // Reading through `loadState` runs the migration, so an update from an
    // older schema keeps every existing customization.
    const state = await loadState();
    await saveState(state);
    log.info('storage ready:', details.reason, 'schema v' + state.schemaVersion);
  });

  browser.runtime.onMessage.addListener((message: unknown) => {
    // Exactly one message type is accepted, and it carries no payload, so a
    // page cannot use this channel to ask the extension for anything.
    if (!isBackgroundMessage(message)) return;
    void browser.runtime.openOptionsPage();
  });
});
