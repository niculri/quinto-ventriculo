// Tests the sizes of an article's figures, where thumbnails go, and the rest of prepareArticle.

import { describe, expect, it } from 'vitest';
import { markSanitized } from '../../../../shared/lib/sanitizedHtml';
import { prepareArticle as prepareSanitized } from '../articleHtml';
import {
  COLUMN_PX,
  PANORAMA,
  PANORAMA_MAX_PX,
  THUMB_MAX_PX,
  THUMB_MIN_PX,
  figureLayout,
  rowWidths,
} from '../figures';

// What the browser's sanitizer gave, as the page passes it.
const prepareArticle = (html: string) => prepareSanitized(markSanitized(html));

const fig = (attrs: string, w = 1600, h = 1200, classes = 'figure') =>
  `<figure class="${classes}"${attrs}><img data-media="k" alt="Una lámina" width="${w}" height="${h}"></figure>`;
const para = (words: number) => `<p>${'palabra '.repeat(words)}</p>`;
/** Four columns: it needs the whole column, never beside a thumbnail. */
const table = '<table><tbody><tr><td>1</td><td>2</td><td>3</td><td>4</td></tr></tbody></table>';
/** A short table, which may go beside one. */
const shortTable = (rows: number, cell = 'celda') =>
  `<table><tbody>${`<tr><td>${cell}</td><td>${cell}</td></tr>`.repeat(rows)}</tbody></table>`;

describe('the layout of an article’s figures', () => {
  it('a thumbnail of about the same area whatever its shape: 300px for a 4:3 image', () => {
    expect(figureLayout({ width: 1600, height: 1200 })).toEqual({ kind: 'thumb', width: 300 });
    const wide = figureLayout({ width: 2000, height: 1000 }).width;
    const tall = figureLayout({ width: 1000, height: 1250 }).width;
    expect(wide).toBeGreaterThan(300);
    expect(tall).toBeLessThan(300);
    expect(wide * (1000 / 2000) * wide).toBeCloseTo(300 * 225, -1);
  });

  it('never narrower than its minimum, wider than half the column or than its pixels', () => {
    expect(figureLayout({ width: 300, height: 2000 }).width).toBe(THUMB_MIN_PX);
    expect(figureLayout({ width: 2300, height: 1000 }).width).toBeLessThanOrEqual(THUMB_MAX_PX);
    expect(figureLayout({ width: 200, height: 150 }).width).toBe(200);
  });

  it('a large plate goes wide, as wide as its pixels; a panorama too, up to 600px', () => {
    expect(figureLayout({ plate: true, width: 1800, height: 1500 })).toEqual({
      kind: 'wide',
      width: 1800,
    });
    expect(figureLayout({ width: PANORAMA * 500, height: 500 })).toEqual({
      kind: 'wide',
      width: PANORAMA_MAX_PX,
    });
    expect(figureLayout({ width: PANORAMA * 200, height: 200 })).toEqual({
      kind: 'wide',
      width: PANORAMA * 200,
    });
    expect(figureLayout({ width: PANORAMA * 500 - 1, height: 500 }).kind).toBe('thumb');
  });

  it('a plate with its percentage is that share of the column, never wider than its pixels', () => {
    const sixty = figureLayout({ plate: true, percent: 60, width: 1800, height: 1500 });
    expect(sixty.kind).toBe('wide');
    expect(sixty.width).toBeCloseTo(COLUMN_PX * 0.6);
    expect(figureLayout({ plate: true, percent: 90, width: 500, height: 400 }).width).toBe(500);
    expect(figureLayout({ plate: true, percent: 150, width: 1800, height: 1500 }).width).toBe(
      COLUMN_PX,
    );
    expect(figureLayout({ plate: true, percent: 50 }).width).toBe(COLUMN_PX / 2);
  });

  it('a row: the same height, the column’s width with the gaps, never enlarged', () => {
    const [a, b] = rowWidths([
      { width: 800, height: 400 },
      { width: 400, height: 400 },
    ]);
    expect(a! / 2).toBeCloseTo(b!);
    expect(a! + b! + 16).toBeCloseTo(COLUMN_PX);
    const small = rowWidths([
      { width: 200, height: 100 },
      { width: 100, height: 100 },
    ]);
    expect(small).toEqual([200, 100]);
  });

  it('a row without figures has no widths, and one with a size missing shares the column evenly', () => {
    expect(rowWidths([])).toEqual([]);
    expect(rowWidths([{ width: 800, height: 400 }, {}, { width: 10 }])).toEqual([
      (COLUMN_PX - 32) / 3,
      (COLUMN_PX - 32) / 3,
      (COLUMN_PX - 32) / 3,
    ]);
  });
});

describe('prepareArticle', () => {
  it('marks each figure as a thumbnail or wide, with its width as a variable, and drops the percentage', () => {
    const html = prepareArticle(
      fig(' style="width:40%"') + para(300) + fig('', 1600, 1200, 'figure figure-plate'),
    );
    expect(html).toContain('class="figure is-thumb" style="--fig: 18.75rem; --ar: 1.333;"');
    expect(html).toContain('is-wide');
    expect(html).not.toContain('40%');
    expect(html).toContain('role="button"');
    expect(html).toContain('aria-label="Ampliar la imagen: Una lámina"');
  });

  it('a plate that does not read small keeps the width its percentage gives, and the percentage leaves the style', () => {
    const html = prepareArticle(fig(' style="width:85%"', 1600, 1200, 'figure figure-plate'));
    expect(html).toContain(`--fig: ${Math.round((COLUMN_PX * 0.85 * 100) / 16) / 100}rem`);
    expect(html).toContain('is-wide');
    expect(html).not.toContain('85%');
  });

  it('gives each figure its shape, so the CSS keeps it within the window; without its size, none', () => {
    const html = prepareArticle(
      fig('', 870, 1547, 'figure figure-plate') + '<figure class="figure"><img></figure>',
    );
    expect(html).toContain('--ar: 0.562;');
    expect(html.match(/--ar/g)).toHaveLength(1);
    const inCallout = prepareArticle(
      '<aside class="callout"><figure class="figure"><img></figure></aside>',
    );
    expect(inCallout).not.toContain('--ar');
    const row = prepareArticle(
      `<div class="figure-row">${fig('', 800, 400)}${fig('', 400, 400)}</div>`,
    );
    expect(row).toContain('--ar: 2;');
    expect(row).toContain('--ar: 1;');
  });

  it('in a callout, the figure the source made wide fills it', () => {
    const html = prepareArticle(
      `<aside class="callout"><figure class="figure figure-wide"><img width="900" height="800"></figure></aside>`,
    );
    expect(html).toContain('is-wide');
  });

  it('sizes the figures of a row together', () => {
    const html = prepareArticle(
      `<div class="figure-row">${fig('', 800, 400)}${fig('', 400, 400)}</div>`,
    );
    const widths = [...html.matchAll(/--fig: ([\d.]+)rem/g)].map((m) => Number(m[1]));
    expect(widths).toHaveLength(2);
    expect(widths[0]! / widths[1]!).toBeCloseTo(2, 1);
  });

  const order = (html: string) =>
    [...prepareArticle(html).matchAll(/<(figure|p|div class="table-scroll[^"]*"|h3)/g)].map(
      (m) => m[1],
    );

  it('moves a thumbnail down below a table, beside the text after it, when its own is too short', () => {
    expect(order('<h3>Título</h3>' + para(5) + fig('') + table + para(200))).toEqual([
      'h3',
      'p',
      'div class="table-scroll"',
      'figure',
      'p',
    ]);
    expect(order(para(80) + fig('') + para(5) + table + '<h3>Otra</h3>' + para(200))).toEqual([
      'figure',
      'p',
      'p',
      'div class="table-scroll"',
      'h3',
      'p',
    ]);
    expect(order(para(5) + fig('') + para(300) + table + para(300))).toEqual([
      'p',
      'figure',
      'p',
      'div class="table-scroll"',
      'p',
    ]);
  });

  it('counts the text beside a thumbnail in the rest of the column: just short, it goes up a paragraph', () => {
    const html = para(5) + fig('', 400, 1200) + para(215) + table + para(400);
    expect(order(html)).toEqual(['figure', 'p', 'p', 'div class="table-scroll"', 'p']);
  });

  it('without enough text anywhere in its section, it stays a thumbnail where the strip is smallest', () => {
    const html = '<h3>A</h3>' + fig('') + para(5) + table + '<h3>B</h3>' + para(300);
    expect(order(html)).toEqual(['h3', 'figure', 'p', 'div class="table-scroll"', 'h3', 'p']);
    expect(prepareArticle(html)).toContain('class="figure is-thumb"');
  });

  it('moves a thumbnail up over the paragraphs it needs when there is no text below the table', () => {
    expect(order(para(80) + fig('') + para(5) + table)).toEqual([
      'figure',
      'p',
      'p',
      'div class="table-scroll"',
    ]);
    expect(order(para(80) + fig('') + para(400) + table)).toEqual([
      'p',
      'figure',
      'p',
      'div class="table-scroll"',
    ]);
    expect(order('<h3>Título</h3>' + para(10) + para(10) + fig('') + table)).toEqual([
      'h3',
      'figure',
      'p',
      'p',
      'div class="table-scroll"',
    ]);
    expect(order(para(10) + para(400) + para(10) + fig('') + table)).toEqual([
      'p',
      'figure',
      'p',
      'p',
      'div class="table-scroll"',
    ]);
    expect(order('<h3>Título</h3>' + fig('') + table)).toEqual([
      'h3',
      'figure',
      'div class="table-scroll"',
    ]);
    const side = prepareArticle(
      para(80) + `<div class="side side-right">${fig('')}${para(5)}</div>` + '<h2>Otra</h2>',
    );
    expect(side.indexOf('<figure')).toBeLessThan(side.indexOf('<p>'));
  });

  it('two thumbnails in a row need the text of both: together they move to where it is', () => {
    expect(order(fig('') + fig('', 1200, 1600) + para(5) + table + para(400))).toEqual([
      'p',
      'div class="table-scroll"',
      'figure',
      'figure',
      'p',
    ]);
    expect(order(fig('') + fig('', 1200, 1600) + para(120) + table + para(400))).toEqual([
      'figure',
      'p',
      'div class="table-scroll"',
      'figure',
      'p',
    ]);
    expect(order(fig('') + fig('', 1200, 1600) + para(400) + table)).toEqual([
      'figure',
      'figure',
      'p',
      'div class="table-scroll"',
    ]);
  });

  it('a list counts a line per item: a short list of many items is enough text, the same words in a paragraph are not', () => {
    const items = `<ul>${'<li>uno</li>'.repeat(20)}</ul>`;
    expect(order(fig('') + items + table + para(300))).toEqual([
      'figure',
      'div class="table-scroll"',
      'p',
    ]);
    expect(order(fig('') + para(20) + table + para(300))).toEqual([
      'p',
      'div class="table-scroll"',
      'figure',
      'p',
    ]);
  });

  it('when no place has enough text, it goes where the strip is smallest, even if that is further', () => {
    expect(
      order('<h3>A</h3>' + fig('') + para(5) + table + para(60) + table + '<h3>B</h3>'),
    ).toEqual([
      'h3',
      'p',
      'div class="table-scroll"',
      'figure',
      'p',
      'div class="table-scroll"',
      'h3',
    ]);
  });

  it('without text enough in its section, a short table goes beside it if that fills the strip', () => {
    const html = (rows: number) =>
      '<h3>A</h3>' + para(5) + fig('') + shortTable(rows) + para(5) + '<h2>B</h2>' + para(300);
    const filled = prepareArticle(html(6));
    expect(filled).toContain('class="table-scroll is-beside"');
    expect(order(html(6))).toEqual([
      'h3',
      'p',
      'figure',
      'div class="table-scroll is-beside"',
      'p',
      'p',
    ]);
    expect(prepareArticle(html(1))).not.toContain('is-beside');
    const long = '<h3>A</h3>' + fig('') + shortTable(7) + '<h3>B</h3>';
    expect(prepareArticle(long)).not.toContain('is-beside');
    const tall = '<h3>A</h3>' + fig('') + shortTable(2, 'palabra '.repeat(60)) + '<h3>B</h3>';
    expect(prepareArticle(tall)).toContain('is-beside');
  });

  const kinds = (html: string) =>
    [...prepareArticle(html).matchAll(/<figure class="([^"]*)"/g)].map((m) =>
      m[1]!.includes('is-wide') ? 'wide' : 'side',
    );

  it('too many figures for the text of their section: the last of a stack goes wide, the rest stay', () => {
    const html =
      '<h3>A</h3>' + fig('') + para(120) + fig('', 1200, 1600) + '<h2>B</h2>' + para(400);
    expect(kinds(html)).toEqual(['side', 'wide']);
    expect(order(html)).toEqual(['h3', 'figure', 'p', 'figure', 'p']);
  });

  it('a figure that goes wide takes its own share of the column, never more than its pixels', () => {
    const stack = (last: string) =>
      prepareArticle('<h3>A</h3>' + fig('') + para(120) + last + '<h2>B</h2>' + para(400));
    const widths = (html: string) =>
      [...html.matchAll(/--fig: ([\d.]+)rem/g)].map((m) => Number(m[1]) * 16);
    expect(widths(stack(fig(' style="width:50%"', 1200, 1600)))[1]).toBeCloseTo(COLUMN_PX / 2, 0);
    expect(widths(stack(fig('', 400, 530)))[1]).toBeCloseTo(400, 0);
    const unsized = stack('<figure class="figure" style="width:60%"><img alt="x"></figure>');
    expect(unsized).toContain('class="figure is-wide"');
    expect(widths(unsized)[1]).toBeCloseTo(COLUMN_PX * 0.6, 0);
  });

  it('places them all again after one goes wide: a short table keeps its place beside a thumbnail', () => {
    const html =
      '<h3>A</h3>' +
      para(5) +
      fig('') +
      shortTable(6) +
      para(5) +
      '<h2>B</h2>' +
      '<h3>C</h3>' +
      fig('') +
      para(120) +
      fig('', 1200, 1600) +
      '<h2>D</h2>' +
      para(400);
    expect(kinds(html)).toEqual(['side', 'side', 'wide']);
    expect(prepareArticle(html)).toContain('class="table-scroll is-beside"');
  });

  it('a thumbnail of a side column never goes wide', () => {
    const html =
      '<h3>A</h3><div class="side side-right">' +
      fig('') +
      para(5) +
      '</div>' +
      fig('') +
      para(5) +
      '<h2>B</h2>' +
      para(400);
    expect(kinds(html)).toEqual(['side', 'wide']);
  });

  it('a strip of a few lines does not make one wide, nor does a thumbnail alone in its section', () => {
    expect(kinds('<h3>A</h3>' + fig('') + para(100) + fig('') + para(20) + '<h2>B</h2>')).toEqual([
      'side',
      'side',
    ]);
    expect(kinds('<h3>A</h3>' + fig('') + para(5) + '<h2>B</h2>' + para(400))).toEqual(['side']);
  });

  it('a thumbnail under the foot of the one above starts there: it does not go up into its text', () => {
    const html = '<h3>A</h3>' + fig('', 1200, 1600) + para(10) + para(110) + fig('') + '<h2>B</h2>';
    expect(order(html)).toEqual(['h3', 'figure', 'p', 'p', 'figure']);
    expect(kinds(html)).toEqual(['side', 'wide']);
  });

  it('when two places miss the same text, the nearest one wins: it stays', () => {
    expect(
      order('<h3>A</h3>' + fig('') + para(5) + table + para(5) + table + '<h3>B</h3>'),
    ).toEqual([
      'h3',
      'figure',
      'p',
      'div class="table-scroll"',
      'p',
      'div class="table-scroll"',
      'h3',
    ]);
  });

  it('marks the <sup> and <sub> that Inter draws with its own glyphs, and only those', () => {
    const html = prepareArticle(
      'Ca<sup>2+</sup> 10<sup>−9</sup> IP<sub>3</sub> K<sub>d</sub> V<sub>máx</sub> K<sub>M</sub> x<sup>-1</sup>',
    );
    const own = [...html.matchAll(/<(sup|sub) class="own-glyphs">([^<]*)</g)].map((m) => m[2]);
    expect(own).toEqual(['2+', '−9', '3', 'd']);
  });

  it('wraps each table in a wrapper that scrolls sideways, once', () => {
    const once = prepareArticle('<table><tbody><tr><td>1</td></tr></tbody></table>');
    expect(once).toBe(
      '<div class="table-scroll"><table><tbody><tr><td>1</td></tr></tbody></table></div>',
    );
    expect(prepareArticle(once)).toBe(once);
  });
});
