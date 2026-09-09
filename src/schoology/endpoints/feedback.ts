import { parseRecentFeedback } from '../adapters/dashboard';
import type { RecentFeedbackItem } from '@/src/types';

/** Read the documented native grade-report page once, with the existing session. */
export async function fetchRecentFeedback(doc: Document): Promise<RecentFeedbackItem[] | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(new URL('/grades/grades', doc.location.origin), {
      credentials: 'same-origin', signal: controller.signal, headers: { Accept: 'text/html' },
    });
    if (!response.ok || new URL(response.url || doc.location.href).origin !== doc.location.origin) return null;
    const html = await response.text();
    const parser = doc.defaultView?.DOMParser;
    if (!parser) return null;
    return parseRecentFeedback(new parser().parseFromString(html, 'text/html'));
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
