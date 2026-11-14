// Golden test: the shared HTML corpus (packages/html/test) through the card sanitizing in the browser, as recorded.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { sanitizeCardInBrowser } from './CardFrame';

const read = (path: string) => JSON.parse(readFileSync(path, 'utf8'));
const corpus = read(join(import.meta.dirname, '../../../../../packages/html/test/corpus.json')) as {
  html: { id: string; html: string }[];
};

it('a card side sanitized again in the browser gives what it gave', () => {
  const out = Object.fromEntries(corpus.html.map((c) => [c.id, sanitizeCardInBrowser(c.html)]));
  expect(out).toEqual(read(join(import.meta.dirname, 'sanitize-golden.json')));
});
