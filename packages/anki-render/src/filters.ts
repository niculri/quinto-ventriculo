// SPDX-License-Identifier: AGPL-3.0-or-later
// Portions derived from Anki (https://github.com/ankitects/anki), © Ankitects Pty Ltd and contributors,
// AGPL-3.0-or-later. Modified for El Quinto Ventrículo in 2026.
import { blake3 } from '@noble/hashes/blake3.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import { clozeFilter, revealClozeTextOnly } from './cloze';
import { stripHtml } from './html';

/** Port of Anki's rslib/src/template_filters.rs (the filters built into the template language). */

export interface FilterContext {
  /** Cloze number of the card (template ordinal + 1). */
  clozeOrd: number;
  /** Question side? (FrontSide is not known yet). */
  question: boolean;
}

/** Applies the filters in order. Stops at the first unknown one, as Anki does when rendering for Python. */
export function applyFilters(
  text: string,
  filters: string[],
  fieldName: string,
  context: FilterContext,
): string {
  const last = filters.at(-1);
  const list =
    filters.length === 2 && filters[0] === 'cloze' && last === 'type'
      ? ['type-cloze']
      : filters.length === 2 && filters[0] === 'nc' && last === 'type'
        ? ['type-nc']
        : last === 'type'
          ? ['type']
          : filters;
  for (const name of list) {
    const output = applyFilter(name, text, fieldName, context);
    // An unknown filter would be left to the Python hooks, which (without add-ons) do nothing.
    if (output === null) return text;
    text = output;
  }
  return text;
}

function applyFilter(
  name: string,
  text: string,
  fieldName: string,
  context: FilterContext,
): string | null {
  switch (name) {
    case 'text':
      return stripHtml(text);
    case 'furigana':
      return furigana(text, (base, reading) => `<ruby><rb>${base}</rb><rt>${reading}</rt></ruby>`);
    case 'kanji':
      return furigana(text, (base) => base);
    case 'kana':
      return furigana(text, (_, reading) => reading);
    case 'type':
      return `[[type:${fieldName}]]`;
    case 'type-cloze':
      return `[[type:cloze:${fieldName}]]`;
    case 'type-nc':
      return `[[type:nc:${fieldName}]]`;
    case 'hint':
      return hint(text, fieldName);
    case 'cloze':
      return clozeFilter(text, context.clozeOrd, context.question);
    case 'cloze-only':
      return revealClozeTextOnly(text, context.clozeOrd, context.question);
    case '':
      return text;
    default:
      return name.startsWith('tts ') ? ttsFilter(name.slice(4), text) : null;
  }
}

const FURIGANA = / ?([^ >]+?)\[(.+?)\]/g;

function furigana(text: string, replace: (base: string, reading: string) => string): string {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(FURIGANA, (whole, base: string, reading: string) =>
      reading.startsWith('sound:') ? whole : replace(base, reading),
    );
}

function hint(text: string, fieldName: string): string {
  if (!text.trim()) return text;
  const digest = blake3(new Uint8Array([...utf8ToBytes(text), ...utf8ToBytes(fieldName)]));
  const id = bytesToHex(digest.subarray(0, 8));
  return `
<a class=hint href="#"
onclick="this.style.display='none';
document.getElementById('hint${id}').style.display='block';
return false;" draggable=false>
${fieldName}</a>
<div id="hint${id}" class=hint style="display: none">${text}</div>
`;
}

function ttsFilter(options: string, text: string): string {
  return `[anki:tts lang=${options}]${text}[/anki:tts]`;
}
