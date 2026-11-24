// What an article's figure says about its size: its pixels, and whether it is a plate and at which share of the column.

import type { FigureSize } from './figures';

export function sizeOf(figure: HTMLElement): FigureSize {
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
