// The article's HTML sanitized again in the browser, before it is injected.
import DOMPurify from 'dompurify';

/** Defense in depth: the importer already sanitizes it, and it is the only HTML the web injects. */
export function sanitizeInBrowser(html: string): string {
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['style', 'form', 'input', 'button', 'iframe', 'script'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick'],
  });
}
