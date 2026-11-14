// SPDX-License-Identifier: AGPL-3.0-or-later
// Portions derived from Anki (https://github.com/ankitects/anki), © Ankitects Pty Ltd and contributors,
// AGPL-3.0-or-later. Modified for El Quinto Ventrículo in 2026.
/**
 * Sidebar search terms as Anki's search writer writes them (rslib/src/search/writer.rs): names and tags escaped
 * so they match exactly, quoted only where the parser needs it.
 */
import { escapeAnkiWildcards } from './text';

/** Anki's `needs_quotation`. */
function needsQuotation(txt: string): boolean {
  return /^and$|^or$/i.test(txt) || /^-[^\n]/u.test(txt) || /[ \u3000()]/.test(txt);
}

/** Anki's `maybe_quote`. */
function maybeQuote(txt: string): string {
  const escaped = txt.replaceAll('"', '\\"');
  return needsQuotation(txt) ? `"${escaped}"` : escaped;
}

/** For `card`, the value is a template name (one made only of digits reads as `card:N`, as in Anki). */
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
