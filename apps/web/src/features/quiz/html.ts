import DOMPurify from 'dompurify';

/**
 * The texts and figures of a test come already sanitized from the importer (texts: bold, italics,
 * superscripts, subscripts and line breaks; figures: drawing-only SVG). They are sanitized again here, as the
 * notes and the cards are (defense in depth), and remembered: a question is shown many times.
 */

const textCache = new Map<string, string>();
const svgCache = new Map<string, string>();

function remember(cache: Map<string, string>, key: string, make: () => string): string {
  let v = cache.get(key);
  if (v === undefined) {
    v = make();
    // A bounded cache: a test has a few thousand texts.
    if (cache.size > 5000) cache.clear();
    cache.set(key, v);
  }
  return v;
}

/** A text of the test: only the inline marks it can have. */
export function cleanText(html: string): string {
  return remember(textCache, html, () =>
    DOMPurify.sanitize(html, { ALLOWED_TAGS: ['b', 'i', 'sup', 'sub', 'br'], ALLOWED_ATTR: [] }),
  );
}

/**
 * A value that loads or runs something. DOMPurify lets `fill="url(https://…)"` through (and its CSS-escaped
 * form, `u\72 l(`): the browser would fetch that document. The importer already drops them; here, again.
 */
const UNSAFE_VALUE = /url\s*\(|\\|javascript:|expression\s*\(/i;

/** An SVG figure: drawing only (no scripts, links, foreign content, styles or external references). */
export function cleanSvg(svg: string): string {
  return remember(svgCache, svg, () => {
    const fragment = DOMPurify.sanitize(svg, {
      USE_PROFILES: { svg: true },
      // The figures say what they show to a screen reader (role="img" + aria-label).
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
    return box.innerHTML;
  });
}
