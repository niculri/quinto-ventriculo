import { describe, expect, it } from 'vitest';
import { prepareArticle } from './articleHtml';
import {
  COLUMN_PX,
  PANORAMA,
  PANORAMA_MAX_PX,
  THUMB_MAX_PX,
  THUMB_MIN_PX,
  figureLayout,
  rowWidths,
} from './figures';

const fig = (attrs: string, w = 1600, h = 1200, classes = 'figure') =>
  `<figure class="${classes}"${attrs}><img data-media="k" alt="Una lámina" width="${w}" height="${h}"></figure>`;
const para = (words: number) => `<p>${'palabra '.repeat(words)}</p>`;
const table = '<table><tbody><tr><td>1</td></tr></tbody></table>';

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
});

describe('prepareArticle', () => {
  it('marks each figure as a thumbnail or wide, with its width as a variable, and drops the percentage', () => {
    const html = prepareArticle(
      fig(' style="width:40%"') + para(300) + fig('', 1600, 1200, 'figure figure-plate'),
    );
    expect(html).toContain('class="figure is-thumb" style="--fig: 18.75rem;"');
    expect(html).toContain('is-wide');
    expect(html).not.toContain('40%');
    expect(html).toContain('role="button"');
    expect(html).toContain('aria-label="Ampliar la imagen: Una lámina"');
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
    [...prepareArticle(html).matchAll(/<(figure|p|div class="table-scroll"|h3)/g)].map((m) => m[1]);

  it('moves a thumbnail down below a table, beside the text after it, when its own is too short', () => {
    expect(order('<h3>Título</h3>' + para(5) + fig('') + table + para(200))).toEqual([
      'h3',
      'p',
      'div class="table-scroll"',
      'figure',
      'p',
    ]);
    // Never into the next section: up instead, if it can.
    expect(order(para(80) + fig('') + para(5) + table + '<h3>Otra</h3>' + para(200))).toEqual([
      'figure',
      'p',
      'p',
      'div class="table-scroll"',
      'h3',
      'p',
    ]);
    // Enough text beside it: it stays.
    expect(order(para(5) + fig('') + para(300) + table + para(300))).toEqual([
      'p',
      'figure',
      'p',
      'div class="table-scroll"',
      'p',
    ]);
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
    // Two short paragraphs above: over both, but never over a heading.
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
