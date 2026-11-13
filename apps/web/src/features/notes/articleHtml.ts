import { figureLayout, rowWidths, toRem } from './figures';
import type { FigureSize } from './figures';
import { placeThumbs } from './placeThumbs';

/** What Inter's superscripts and subscripts (`sups`, `subs`) cover: the glyphs of ⁰–⁹ ⁺ ⁻ ₀–₉ ᵢ and more. */
const OWN_GLYPHS = /^[a-z0-9()[\]=+−]+$/;

/**
 * The note's HTML (already sanitized) ready to read: each figure a thumbnail on the right or wide across the column,
 * with its width, each table in a wrapper that scrolls sideways, the superscripts and subscripts with the font's own
 * glyphs where it has them, and each image a button that opens the viewer. Done before the first paint, so nothing moves afterwards.
 */
export function prepareArticle(html: string): string {
  const template = document.createElement('template');
  template.innerHTML = html;
  const root = template.content;

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

  for (const table of root.querySelectorAll('table')) {
    if (table.parentElement?.classList.contains('table-scroll')) continue;
    const wrapper = document.createElement('div');
    wrapper.className = 'table-scroll';
    table.replaceWith(wrapper);
    wrapper.append(table);
  }

  placeThumbs(root);

  for (const script of root.querySelectorAll('sup, sub')) {
    if (!script.children.length && OWN_GLYPHS.test(script.textContent ?? '')) {
      script.classList.add('own-glyphs');
    }
  }

  for (const img of root.querySelectorAll('figure img')) {
    img.setAttribute('role', 'button');
    img.setAttribute('tabindex', '0');
    img.setAttribute(
      'aria-label',
      `Ampliar la imagen${img.getAttribute('alt') ? `: ${img.getAttribute('alt')}` : ''}`,
    );
  }
  return template.innerHTML;
}

function sizeOf(figure: HTMLElement): FigureSize {
  const img = figure.querySelector('img');
  const number = (name: string) => Number(img?.getAttribute(name)) || undefined;
  const width = number('width');
  const height = number('height');
  return {
    ...(figure.classList.contains('figure-plate') ? { plate: true } : {}),
    ...(width ? { width } : {}),
    ...(height ? { height } : {}),
  };
}

function setWidth(figure: HTMLElement, px: number) {
  figure.style.removeProperty('width');
  figure.style.setProperty('--fig', toRem(px));
}
