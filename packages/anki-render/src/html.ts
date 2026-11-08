// SPDX-License-Identifier: AGPL-3.0-or-later
// Portions derived from Anki (https://github.com/ankitects/anki), © Ankitects Pty Ltd and contributors,
// AGPL-3.0-or-later. Modified for El Quinto Ventrículo in 2026.
import { decodeHTMLStrict } from 'entities';

/**
 * HTML helpers with the same behavior as Anki's (rslib/src/text.rs and the `htmlescape` crate it uses), so
 * the rendered cards match Anki's byte for byte.
 */

// rslib/src/text.rs: HTML
const HTML =
  /(<!--[\s\S]*?-->)|(<style[\s\S]*?>[\s\S]*?<\/style>)|(<script[\s\S]*?>[\s\S]*?<\/script>)|(<[\s\S]*?>)/gi;

/** Removes the tags (and comments, styles and scripts with their content), keeping the entities. */
export function stripHtmlPreservingEntities(html: string): string {
  return html.replace(HTML, '');
}

/** Removes the tags and decodes the entities (Anki's `strip_html`, used by the `text:` filter). */
export function stripHtml(html: string): string {
  return decodeEntities(stripHtmlPreservingEntities(html));
}

const ENTITY = /&(?:#([0-9]+)|#[xX]([0-9a-fA-F]+)|([A-Za-z][A-Za-z0-9]*));/y;

/**
 * Decodes the entities like `htmlescape::decode_html`: if any «&» does not start a valid entity, the text is
 * returned as is (that is what Anki does when decoding fails). Non-breaking spaces become plain spaces.
 */
export function decodeEntities(html: string): string {
  if (!html.includes('&')) return html;
  let out = '';
  let last = 0;
  for (let i = html.indexOf('&'); i >= 0; i = html.indexOf('&', last)) {
    ENTITY.lastIndex = i;
    const m = ENTITY.exec(html);
    if (!m) return html;
    let decoded: string;
    if (m[1] !== undefined || m[2] !== undefined) {
      const code = m[1] !== undefined ? Number.parseInt(m[1], 10) : Number.parseInt(m[2]!, 16);
      if (!Number.isFinite(code) || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) {
        return html;
      }
      decoded = String.fromCodePoint(code);
    } else {
      decoded = decodeHTMLStrict(m[0]);
      if (decoded === m[0]) return html; // unknown name
    }
    out += html.slice(last, i) + decoded;
    last = i + m[0].length;
  }
  return (out + html.slice(last)).replace(/\u00a0/g, ' ');
}

const MINIMAL: Record<string, string> = {
  '"': '&quot;',
  '&': '&amp;',
  "'": '&#x27;',
  '<': '&lt;',
  '>': '&gt;',
};

/**
 * `htmlescape::encode_attribute`: the five minimal entities by name, and every other character below 256
 * that is not an ASCII letter or digit as `&#xHH;` (characters from 256 up stay as they are).
 */
export function encodeAttribute(text: string): string {
  let out = '';
  for (const ch of text) {
    const named = MINIMAL[ch];
    if (named) {
      out += named;
      continue;
    }
    const code = ch.codePointAt(0)!;
    if (code < 256 && (code > 127 || !/[A-Za-z0-9]/.test(ch))) {
      out += `&#x${code.toString(16).toUpperCase().padStart(2, '0')};`;
    } else {
      out += ch;
    }
  }
  return out;
}

/** `htmlescape::encode_minimal`: only the five minimal entities. */
export function encodeMinimal(text: string): string {
  return text.replace(/["&'<>]/g, (c) => MINIMAL[c]!);
}

// rslib/src/text.rs: PERSISTENT_HTML_SPACERS, TYPE_TAG, SOUND_TAG
const SPACERS = /<br\s*\/?>|<div>|\n/gi;
const TYPE_TAG = /\[\[type:[^\]]+\]\]/g;
const SOUND_TAG = /\[sound:[^\]]+\]/g;

/**
 * Text on one line, like the columns of Anki's browser (`html_to_text_line`), with the runs of spaces
 * collapsed into one.
 */
export function htmlToTextLine(html: string): string {
  return stripHtml(html.replace(SPACERS, ' ').replace(TYPE_TAG, '').replace(SOUND_TAG, ''))
    .replace(/\s+/g, ' ')
    .trim();
}
