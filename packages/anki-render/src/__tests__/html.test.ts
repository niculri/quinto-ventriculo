// Golden test: the shared HTML corpus (packages/html/test) through the HTML helpers that behave like Anki's, as
// recorded. A difference is a change of the rendered cards, not an assertion to update.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import {
  decodeEntities,
  encodeAttribute,
  encodeMinimal,
  htmlToTextLine,
  stripHtml,
  stripHtmlPreservingEntities,
} from '..';

const read = (path: string) => JSON.parse(readFileSync(path, 'utf8'));
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
