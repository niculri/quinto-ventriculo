// The article's HTML sanitized again in the browser, before it is injected.
import DOMPurify from 'dompurify';
import { markSanitized } from '../../../shared/lib/sanitizedHtml';
import type { SanitizedHtml } from '../../../shared/lib/sanitizedHtml';

/** Defense in depth: the importer already sanitizes it, and it is the only HTML the web injects. */
export function sanitizeInBrowser(html: string): SanitizedHtml {
  return markSanitized(
    DOMPurify.sanitize(html, {
      USE_PROFILES: { html: true },
      FORBID_TAGS: ['style', 'form', 'input', 'button', 'iframe', 'script'],
      FORBID_ATTR: ['onerror', 'onload', 'onclick'],
    }),
  );
}
