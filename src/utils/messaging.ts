import { browser } from 'wxt/browser';
import { log } from './log';

/**
 * The one message a content-script surface sends.
 *
 * `browser.runtime.openOptionsPage` is not callable from a content script, so
 * the background page opens the customizer on request. Nothing is sent with the
 * message and nothing is expected back.
 */
export async function openCustomizer(): Promise<void> {
  try {
    await browser.runtime.sendMessage({ type: 'open-options' });
  } catch (error) {
    log.warn('could not open the customizer:', error);
  }
}
