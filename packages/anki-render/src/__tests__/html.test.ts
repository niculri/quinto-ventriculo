// Golden test: the shared HTML corpus (packages/html/test) through the HTML helpers that behave like Anki's, as
// recorded. A difference is a change of the rendered cards, not an assertion to update.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  decodeEntities,
  encodeAttribute,
  encodeMinimal,
  htmlToTextLine,
  stripHtml,
  stripHtmlPreservingEntities,
} from '..';

const read = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'));
const corpus = read(join(import.meta.dirname, '../../../html/test/corpus.json')) as {
  html: { id: string; html: string }[];
};
const golden = read(join(import.meta.dirname, '../../test/htmlGolden.json')) as Record<
  string,
  Record<string, string>
>;
const forms: Record<string, (html: string) => string> = {
  stripHtml,
  stripHtmlPreservingEntities,
  decodeEntities,
  htmlToTextLine,
  encodeAttribute,
  encodeMinimal,
};

for (const [name, f] of Object.entries(forms)) {
  it(`${name} gives what it gave`, () => {
    expect(Object.fromEntries(corpus.html.map((c) => [c.id, f(c.html)]))).toEqual(golden[name]);
  });
}

describe('the edges of what the helpers read and write', () => {
  it('a character reference stands for a code point up to U+10FFFF that is not a surrogate; any other leaves the text as it is', () => {
    expect(decodeEntities('&#x10FFFF;')).toBe('\u{10FFFF}');
    expect(decodeEntities('&#x110000;')).toBe('&#x110000;');
    expect(decodeEntities('&#xD7FF;')).toBe('\uD7FF');
    expect(decodeEntities('&#xD800;')).toBe('&#xD800;');
    expect(decodeEntities('&#xDFFF;')).toBe('&#xDFFF;');
    expect(decodeEntities('&#xE000;')).toBe('\uE000');
  });

  it('an attribute turns into references every character below 256 that is not a letter or a digit, and keeps the rest', () => {
    expect(encodeAttribute('é ÿ')).toBe('&#xE9;&#x20;&#xFF;');
    expect(encodeAttribute('Ā')).toBe('Ā');
    expect(encodeAttribute('a1Z')).toBe('a1Z');
  });
});
