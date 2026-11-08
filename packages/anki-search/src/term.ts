// SPDX-License-Identifier: AGPL-3.0-or-later
// Portions derived from Anki (https://github.com/ankitects/anki), © Ankitects Pty Ltd and contributors,
// AGPL-3.0-or-later. Modified for El Quinto Ventrículo in 2026.
/**
 * Search terms for the sidebar, written like Anki's search writer (rslib/src/search/writer.rs): deck, note
 * type and template names with `\`, `*` and `_` escaped so that they match exactly, tags the same way, and
 * quotes only where the parser needs them.
 */
import { escapeAnkiWildcards } from './text';

/** Anki's `needs_quotation`: `and`/`or`, a leading hyphen, spaces and brackets. */
function needsQuotation(txt: string): boolean {
  return /^and$|^or$/i.test(txt) || /^-[^\n]/u.test(txt) || /[ \u3000()]/.test(txt);
}

/** Anki's `maybe_quote`: escape double quotes and wrap the term in them when needed. */
function maybeQuote(txt: string): string {
  const escaped = txt.replaceAll('"', '\\"');
  return needsQuotation(txt) ? `"${escaped}"` : escaped;
}

/**
 * One search term for the given kind and value, as Anki's sidebar writes it:
 * `searchTerm('deck', '() Medicina UCH::1° Semestre')` → `"deck:() Medicina UCH::1° Semestre"`.
 * For `card`, the value is a template name (a name made only of digits would read as `card:N`, as in Anki).
 */
export function searchTerm(
  kind: 'deck' | 'tag' | 'note' | 'card' | 'is' | 'flag',
  value: string,
): string {
  switch (kind) {
    case 'deck':
    case 'note':
    case 'card':
      return maybeQuote(`${kind}:${escapeAnkiWildcards(value)}`);
    case 'tag': {
      let text = escapeAnkiWildcards(value);
      if (text.startsWith('re:') || text.startsWith('nc:')) text = text.replace(':', '\\:');
      return maybeQuote(`tag:${text}`);
    }
    case 'is':
    case 'flag':
      return `${kind}:${value}`;
  }
}
