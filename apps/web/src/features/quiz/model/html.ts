// Sanitizes a test's texts and SVG figures again in the browser (defense in depth after the importer), with a cache.
import DOMPurify from 'dompurify';
import { markSanitized } from '../../../shared/lib/sanitizedHtml';
import type { SanitizedHtml } from '../../../shared/lib/sanitizedHtml';

const textCache = new Map<string, SanitizedHtml>();
const svgCache = new Map<string, SanitizedHtml>();

function remember(
  cache: Map<string, SanitizedHtml>,
  key: string,
  make: () => SanitizedHtml,
): SanitizedHtml {
  let v = cache.get(key);
  if (v === undefined) {
    v = make();
    if (cache.size > 5000) cache.clear();
    cache.set(key, v);
  }
  return v;
}

export function cleanText(html: string): SanitizedHtml {
  return remember(textCache, html, () =>
    markSanitized(
      DOMPurify.sanitize(html, { ALLOWED_TAGS: ['b', 'i', 'sup', 'sub', 'br'], ALLOWED_ATTR: [] }),
    ),
  );
}

// DOMPurify lets `fill="url(https://…)"` through (also CSS-escaped, `u\72 l(`), and the browser would fetch it.
const UNSAFE_VALUE = /url\s*\(|\\|javascript:|expression\s*\(/i;

export function cleanSvg(svg: string): SanitizedHtml {
  return remember(svgCache, svg, () => {
    const fragment = DOMPurify.sanitize(svg, {
      USE_PROFILES: { svg: true },
      ADD_ATTR: ['role'],
      FORBID_TAGS: ['style', 'script', 'foreignObject', 'use', 'image', 'a', 'animate', 'set'],
      FORBID_ATTR: ['href', 'xlink:href', 'style'],
      RETURN_DOM_FRAGMENT: true,
    });
    for (const el of fragment.querySelectorAll('*')) {
      for (const { name, value } of [...el.attributes]) {
        if (UNSAFE_VALUE.test(value)) el.removeAttribute(name);
      }
    }
    const box = document.createElement('div');
    box.append(fragment);
    return markSanitized(box.innerHTML);
  });
}
