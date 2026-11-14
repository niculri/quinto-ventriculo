// SPDX-License-Identifier: AGPL-3.0-or-later
// Portions derived from Anki (https://github.com/ankitects/anki), © Ankitects Pty Ltd and contributors,
// AGPL-3.0-or-later. Modified for El Quinto Ventrículo in 2026.

// HTML helpers that behave like Anki's rslib/src/text.rs and the `htmlescape` crate, so cards match byte for byte.
import { decodeHTMLStrict } from 'entities';

// rslib/src/text.rs: HTML
const HTML =
  /(<!--[\s\S]*?-->)|(<style[\s\S]*?>[\s\S]*?<\/style>)|(<script[\s\S]*?>[\s\S]*?<\/script>)|(<[\s\S]*?>)/gi;

export function stripHtmlPreservingEntities(html: string): string {
  return html.replace(HTML, '');
}

/** Anki's `strip_html`. */
export function stripHtml(html: string): string {
  return decodeEntities(stripHtmlPreservingEntities(html));
}

const ENTITY = /&(?:#([0-9]+)|#[xX]([0-9a-fA-F]+)|([A-Za-z][A-Za-z0-9]*));/y;

/** `htmlescape::decode_html`: if any «&» does not start a valid entity, the text is returned as is. */
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
      if (decoded === m[0]) return html;
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

/** `htmlescape::encode_attribute`. */
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

/** `htmlescape::encode_minimal`. */
export function encodeMinimal(text: string): string {
  return text.replace(/["&'<>]/g, (c) => MINIMAL[c]!);
}

// rslib/src/text.rs: PERSISTENT_HTML_SPACERS, TYPE_TAG, SOUND_TAG
const SPACERS = /<br\s*\/?>|<div>|\n/gi;
const TYPE_TAG = /\[\[type:[^\]]+\]\]/g;
const SOUND_TAG = /\[sound:[^\]]+\]/g;

/** Anki's `html_to_text_line`, as in the browser's columns. */
export function htmlToTextLine(html: string): string {
  return stripHtml(html.replace(SPACERS, ' ').replace(TYPE_TAG, '').replace(SOUND_TAG, ''))
    .replace(/\s+/g, ' ')
    .trim();
}
