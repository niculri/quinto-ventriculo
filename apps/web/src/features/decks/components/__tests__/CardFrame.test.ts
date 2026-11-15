// Tests the browser's sanitizing of a card side, case by case and on the shared HTML corpus (packages/html/test).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { sanitizeCardInBrowser } from '../CardFrame';

describe('browser sanitizing of cards', () => {
  it('keeps the occlusion data, styles, ids and the canvas; removes scripts and handlers', () => {
    const clean = sanitizeCardInBrowser(
      '<div style="display:none"><div class="cloze" data-shape="rect" data-occludeinactive="1"></div></div>' +
        '<canvas id="image-occlusion-canvas"></canvas><button id="toggle">x</button>' +
        '<script>alert(1)</script><img src="/a" onerror="x()"><a href="#" onclick="x()">a</a>',
    );
    expect(clean).toBe(
      '<div style="display:none"><div class="cloze" data-shape="rect" data-occludeinactive="1"></div></div>' +
        '<canvas id="image-occlusion-canvas"></canvas><button id="toggle">x</button>' +
        '<img src="/a"><a href="#">a</a>',
    );
  });
});

const read = (path: string) => JSON.parse(readFileSync(path, 'utf8'));
const corpus = read(
  join(import.meta.dirname, '../../../../../../../packages/html/test/corpus.json'),
) as {
  html: { id: string; html: string }[];
};

it('a card side sanitized again in the browser gives what it gave', () => {
  const out = Object.fromEntries(corpus.html.map((c) => [c.id, sanitizeCardInBrowser(c.html)]));
  expect(out).toEqual(read(join(import.meta.dirname, 'sanitize-golden.json')));
});
