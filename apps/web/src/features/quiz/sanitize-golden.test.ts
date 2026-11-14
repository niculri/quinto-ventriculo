// Golden test: the shared HTML corpus (packages/html/test) through a test's texts and figures sanitized in the
// browser, as recorded.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { cleanSvg, cleanText } from './html';

const read = (path: string) => JSON.parse(readFileSync(path, 'utf8'));
const corpus = read(join(import.meta.dirname, '../../../../../packages/html/test/corpus.json')) as {
  html: { id: string; html: string }[];
};
const each = (f: (html: string) => string) =>
  Object.fromEntries(corpus.html.map((c) => [c.id, f(c.html)]));

it("a test's texts and SVG figures sanitized again in the browser give what they gave", () => {
  expect({ text: each(cleanText), svg: each(cleanSvg) }).toEqual(
    read(join(import.meta.dirname, 'sanitize-golden.json')),
  );
});
