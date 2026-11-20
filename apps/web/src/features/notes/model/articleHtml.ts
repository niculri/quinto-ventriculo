// Prepares a sanitized article's HTML before the first paint: figure sizes, scrolling tables, the font's own
// superscript glyphs and images that open the viewer.

import { figureLayout, rowWidths, toRem } from './figures';
import type { FigureSize } from './figures';
import { placeThumbs } from './placeThumbs';
import { noteStrings } from '../strings';

/** What Inter's superscripts and subscripts (`sups`, `subs`) cover: the glyphs of ⁰–⁹ ⁺ ⁻ ₀–₉ ᵢ and more. */
const OWN_GLYPHS = /^[a-z0-9()[\]=+−]+$/;

export function prepareArticle(html: string): string {
  const template = document.createElement('template');
  template.innerHTML = html;
  const root = template.content;
  sizeFigures(root);
  wrapTables(root);
  placeThumbs(root);
  markOwnGlyphs(root);
  labelImages(root);
  return template.innerHTML;
}

function sizeFigures(root: DocumentFragment) {
  for (const row of root.querySelectorAll('.figure-row')) {
    const figures = [...row.querySelectorAll<HTMLElement>(':scope > figure')];
    const widths = rowWidths(figures.map(sizeOf));
    figures.forEach((figure, i) => setWidth(figure, widths[i]!));
  }
  for (const figure of root.querySelectorAll<HTMLElement>('figure')) {
    if (figure.closest('.figure-row')) continue;
    // In a callout the source already says which ones fill it (55 % or more).
    const size = sizeOf(figure);
    const layout = figureLayout({ ...size, plate: size.plate || figure.matches('.figure-wide') });
    figure.classList.add(layout.kind === 'wide' ? 'is-wide' : 'is-thumb');
    setWidth(figure, layout.width);
  }
}

function wrapTables(root: DocumentFragment) {
  for (const table of root.querySelectorAll('table')) {
    if (table.parentElement?.classList.contains('table-scroll')) continue;
    const wrapper = document.createElement('div');
    wrapper.className = 'table-scroll';
    table.replaceWith(wrapper);
    wrapper.append(table);
  }
}

function markOwnGlyphs(root: DocumentFragment) {
  for (const script of root.querySelectorAll('sup, sub')) {
    if (!script.children.length && OWN_GLYPHS.test(script.textContent ?? '')) {
      script.classList.add('own-glyphs');
    }
  }
}

function labelImages(root: DocumentFragment) {
  for (const img of root.querySelectorAll('figure img')) {
    img.setAttribute('role', 'button');
    img.setAttribute('tabindex', '0');
    img.setAttribute('aria-label', noteStrings.enlarge(img.getAttribute('alt')));
  }
}

function sizeOf(figure: HTMLElement): FigureSize {
  const img = figure.querySelector('img');
  const number = (name: string) => Number(img?.getAttribute(name)) || undefined;
  const width = number('width');
  const height = number('height');
  const plate = figure.classList.contains('figure-plate');
  const percent = plate ? Number.parseFloat(figure.style.width) || undefined : undefined;
  return {
    ...(plate ? { plate: true } : {}),
    ...(percent ? { percent } : {}),
    ...(width ? { width } : {}),
    ...(height ? { height } : {}),
  };
}

function setWidth(figure: HTMLElement, px: number) {
  figure.style.removeProperty('width');
  figure.style.setProperty('--fig', toRem(px));
}
