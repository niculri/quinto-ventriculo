// HTML that a sanitizer gave: the only kind `SafeHtml` puts in the page. Only the sanitizers may mark a text as such.

declare const sanitized: unique symbol;

export type SanitizedHtml = string & { readonly [sanitized]: true };

/** For what a sanitizer just returned, or a sanitized document that was only rearranged. */
export function markSanitized(html: string): SanitizedHtml {
  return html as SanitizedHtml;
}
