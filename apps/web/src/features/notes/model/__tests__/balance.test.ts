// Tests the «balance» layout: figures at the side unless they do not read small, and figures alike with nothing but
// their source lines between them joined in a gallery.
import { describe, expect, it } from 'vitest';
import { markSanitized } from '../../../../shared/lib/sanitizedHtml';
import { prepareArticle } from '../articleHtml';
import { COLUMN_PX, PANORAMA } from '../figures';
import { ALIKE, MIN_LABEL_PX, SIDE_PX, alike, balanceFigures, labelsAtSide } from '../balance';

const plate = (percent: number | null, w = 1600, h = 1200) =>
  `<figure class="figure figure-plate"${percent ? ` style="width:${percent}%"` : ''}><img data-media="k" alt="Lámina" width="${w}" height="${h}"><figcaption>Lámina</figcaption></figure>`;
const photo = (w = 800, h = 600) =>
  `<figure class="figure"><img data-media="k" alt="Foto" width="${w}" height="${h}"></figure>`;
const text = (letters: number) => `<p>${'a'.repeat(letters)}</p>`;
const row = `<div class="figure-row">${photo()}${photo()}</div>`;

function balanced(html: string) {
  const template = document.createElement('template');
  template.innerHTML = prepareArticle(markSanitized(html));
  return template.content;
}

/** Only the balance, before the thumbnails are placed. */
function balancedOnly(html: string) {
  const template = document.createElement('template');
  template.innerHTML = html;
  balanceFigures(template.content);
  return template.content;
}

const kinds = (root: DocumentFragment) =>
  [...root.children]
    .filter((e) => e.matches('figure'))
    .map((e) => (e.classList.contains('is-wide') ? 'wide' : 'side'));
const px = (el: Element | null) =>
  parseFloat((el as HTMLElement).style.getPropertyValue('--fig')) * 16;

describe('how tall a figure’s words would be at the side', () => {
  it('a photo or a small diagram has nothing to read; a strip or an unmeasured plate cannot be read', () => {
    expect(labelsAtSide({ width: 800, height: 600 })).toBe(Infinity);
    expect(labelsAtSide({ width: PANORAMA * 400, height: 400 })).toBe(0);
    expect(labelsAtSide({ plate: true, width: 1600, height: 1200 })).toBe(0);
  });

  it('a plate’s words shrink with it, from the 12 px they have at its share of the column', () => {
    expect(labelsAtSide({ plate: true, percent: 50, width: 1600, height: 1200 })).toBeCloseTo(
      (12 * SIDE_PX) / (COLUMN_PX / 2),
    );
    expect(labelsAtSide({ plate: true, percent: 50, width: 200, height: 150 })).toBeCloseTo(
      (12 * 200) / (COLUMN_PX / 2),
    );
    expect(labelsAtSide({ plate: true, percent: 50 })).toBeGreaterThan(MIN_LABEL_PX);
    expect(labelsAtSide({ plate: true, percent: 90, width: 1600, height: 1200 })).toBeLessThan(
      MIN_LABEL_PX,
    );
  });
});

describe('the balance of an article’s figures', () => {
  it('what reads small goes to the side, 40 % of the column at most', () => {
    const root = balanced(`<h2>A</h2>${photo(2000, 1500)}${text(1500)}${plate(45)}${text(1500)}`);
    expect(kinds(root)).toEqual(['side', 'side']);
    for (const figure of root.querySelectorAll('figure')) {
      expect(px(figure)).toBeLessThanOrEqual(SIDE_PX + 0.1);
      expect(figure.getAttribute('style')).not.toContain('width:');
    }
  });

  it('every plate that does not read at the side goes wide, however many a section has', () => {
    const root = balanced(
      `<h2>A</h2>${plate(70)}${text(1200)}${plate(95)}${text(100)}${plate(85)}${text(300)}`,
    );
    expect(kinds(root)).toEqual(['side', 'wide', 'wide']);
    expect(px(root.querySelector('.is-wide'))).toBeCloseTo(COLUMN_PX * 0.95);
  });

  it('a plate without its pixels at the side takes the side’s width', () => {
    const root = balanced(
      `<h2>A</h2>${plate(90)}${text(300)}<figure class="figure figure-plate" style="width:45%"><img data-media="k" alt="x"></figure>${text(600)}`,
    );
    expect(kinds(root)).toEqual(['wide', 'side']);
    expect(px(root.querySelectorAll('figure')[1]!)).toBeCloseTo(SIDE_PX, 0);
  });

  it('a row does not count: the plates near it go wide or to the side by themselves', () => {
    const root = balanced(
      `<h2>A</h2>${text(100)}${row}${plate(90)}${text(200)}<h2>B</h2>${text(600)}${plate(45)}${text(600)}`,
    );
    expect(kinds(root)).toEqual(['wide', 'side']);
  });

  it('figures with nothing but their source lines between them go together in a gallery', () => {
    const root = balanced(
      `<h2>A</h2>${plate(45)}<p class="source">(Netter)</p>${photo(1500, 1200)}<p class="source">(Gray)</p>${text(300)}`,
    );
    const gallery = root.querySelector('.gallery')!;
    expect(gallery.querySelectorAll('.gallery-slide')).toHaveLength(2);
    expect(gallery.classList.contains('is-thumb')).toBe(true);
    expect((gallery as HTMLElement).style.getPropertyValue('--ar')).toBe('1.25');
    expect(gallery.querySelector('.gallery-count')?.textContent).toBe('1 de 2');
    // Each source line shows with its slide, none after the gallery.
    const slides = [...gallery.querySelectorAll('.gallery-slide')];
    expect(slides.map((s) => s.querySelector(':scope > .source')?.textContent)).toEqual([
      '(Netter)',
      '(Gray)',
    ]);
    expect(root.querySelector('.gallery + .source')).toBeNull();
  });

  it('a figure that stays alone keeps its source line after it', () => {
    const root = balancedOnly(
      `<h2>A</h2>${photo(800, 600)}<p class="source">(Netter)</p>${photo(600, 900)}${text(600)}`,
    );
    expect(root.querySelector('.gallery')).toBeNull();
    expect(root.querySelector('figure + .source + figure')).not.toBeNull();
    expect(root.querySelector('figure .source')).toBeNull();
  });

  it('a gallery is wide when one of its plates does not read small, as wide as its widest', () => {
    const root = balanced(`<h2>A</h2>${plate(45)}${plate(90)}${text(300)}`);
    const gallery = root.querySelector('.gallery')!;
    expect(gallery.classList.contains('is-wide')).toBe(true);
    expect(px(gallery)).toBeCloseTo(COLUMN_PX * 0.9);
  });

  it('joins only figures alike in shape and width: a taller or narrower one starts another', () => {
    const root = balanced(
      `<h2>A</h2>${photo(800, 600)}${photo(820, 600)}${photo(600, 900)}${photo(610, 900)}${plate(45, 200, 150)}${text(300)}`,
    );
    const galleries = [...root.querySelectorAll('.gallery')];
    expect(galleries.map((g) => g.querySelectorAll('.gallery-slide').length)).toEqual([2, 2]);
    expect([...root.children].filter((e) => e.matches('figure:not(.gallery)'))).toHaveLength(1);
  });

  it('calls alike what differs by at most 15 %, and never a figure without its pixels', () => {
    const h = 1000;
    expect(
      alike([
        { width: 1000, height: h },
        { width: 1000 * (1 - ALIKE), height: h },
      ]),
    ).toBe(true);
    expect(
      alike([
        { width: 1000, height: h },
        { width: 1000 * (1 - ALIKE) - 10, height: h },
      ]),
    ).toBe(false);
    expect(alike([{ width: 1000, height: h }, { plate: true }])).toBe(false);
    expect(
      alike([
        { plate: true, width: 300, height: 225 },
        { plate: true, width: 200, height: 150 },
      ]),
    ).toBe(false);
  });

  it('text, however short, a heading or another block keeps figures apart, so nothing is reordered', () => {
    const short = balancedOnly(`${photo()}${text(10)}${photo()}${text(600)}`);
    expect(short.querySelector('.gallery')).toBeNull();
    expect([...short.children].map((e) => e.tagName)).toEqual(['FIGURE', 'P', 'FIGURE', 'P']);
    expect(balanced(`${photo()}<h3>B</h3>${photo()}`).querySelector('.gallery')).toBeNull();
    expect(
      balanced(
        `${photo()}<table><tbody><tr><td>1</td></tr></tbody></table>${photo()}`,
      ).querySelector('.gallery'),
    ).toBeNull();
  });

  it('a figure without its pixels goes to the side at 40 %, with no shape', () => {
    const root = balanced(
      `<figure class="figure figure-plate"><img data-media="k" alt="x"></figure>${text(200)}`,
    );
    const figure = root.querySelector('figure')!;
    expect(figure.classList.contains('is-wide')).toBe(true);
    const side = balanced(
      `<h2>A</h2>${plate(90)}${text(100)}<figure class="figure"><img data-media="k" alt="x"></figure>${text(600)}`,
    );
    expect(px(side.querySelectorAll('figure')[1]!)).toBe(300);
    expect(side.querySelectorAll('figure')[1]!.getAttribute('style')).not.toContain('--ar');
  });

  it('leaves the figures of callouts, sides and rows as they were', () => {
    const root = balanced(`<div class="callout">${photo()}</div>${row}`);
    expect(root.querySelector('.callout figure')?.classList.contains('is-thumb')).toBe(true);
    expect(root.querySelector('.figure-row figure')?.classList.contains('is-thumb')).toBe(false);
  });
});
