// The «balance» layout of an article's figures: at the side unless they do not read small, and figures alike with
// nothing but their source lines between them joined in a gallery (placeThumbs widens what has no text beside it).

import { COLUMN_PX, PANORAMA, figureLayout, toRem } from './figures';
import type { FigureSize } from './figures';
import { sizeOf } from './figureSize';
import { makeGallery } from './gallery';

/** A figure at the side takes 40 % of the column, as Kenhub's. */
export const SIDE_PX = Math.round(COLUMN_PX * 0.4);
/** How tall a plate's words are at its own width: `{NN%!}` is chosen so that they measure this. */
const LABEL_PX = 12;
/**
 * The least they may measure at the side. Measured on the plates: at 6.4 px and more their words still read without
 * enlarging them, small; at 5.6 px and less they do not.
 */
export const MIN_LABEL_PX = 6;
/**
 * How much the slides of a gallery may differ: at the side, in width, and at the gallery's width, in height (as a share
 * of the tallest). Past it the shorter one would leave a band of a few lines of text around it.
 */
export const ALIKE = 0.15;

const FLOW_FIGURE = 'figure.figure';
/** A figure's source line, which goes with it into its slide. */
const SOURCE = 'p.source';

/** Widens a thumbnail the balance laid out; false for one it does not know (in a callout, a side, a row). */
export type Widen = (figure: Element) => boolean;

/**
 * How tall its words would be at the side, in px: `Infinity` when nothing in it needs reading (a photo, a diagram
 * already at a thumbnail's size), 0 when it is a strip (a panorama) or a plate without a measured share.
 */
export function labelsAtSide(size: FigureSize): number {
  if (size.width && size.height && size.width / size.height >= PANORAMA) return 0;
  if (!size.plate) return Infinity;
  if (!size.percent) return 0;
  const width = Math.min(SIDE_PX, size.width ?? SIDE_PX);
  return (LABEL_PX * width) / ((size.percent / 100) * COLUMN_PX);
}

/** Lays out the article's figures and returns how to widen one of them later. */
export function balanceFigures(root: DocumentFragment): Widen {
  joinGalleries(root);
  const wideWidths = new Map<Element, number>();
  for (const el of [...root.children]) {
    if (!(el.matches(FLOW_FIGURE) && el instanceof HTMLElement)) continue;
    const members = el.classList.contains('gallery')
      ? [...el.querySelectorAll<HTMLElement>('.gallery-slide')]
      : [el];
    const sizes = members.map(sizeOf);
    const wideWidth = Math.max(...members.map((m, i) => widthWhenWide(m, sizes[i]!)));
    const wide = Math.min(...sizes.map(labelsAtSide)) < MIN_LABEL_PX;
    lay(el, sizes, wide ? wideWidth : Math.max(...sizes.map(sideWidth)), wide);
    wideWidths.set(el, wideWidth);
  }
  return (figure) => {
    const width = wideWidths.get(figure);
    if (width === undefined) return false;
    figure.classList.replace('is-thumb', 'is-wide');
    (figure as HTMLElement).style.setProperty('--fig', toRem(width));
    return true;
  };
}

/** Whether they would make a gallery without a band around its shortest or narrowest slide. */
export function alike(sizes: FigureSize[]): boolean {
  const ratios = sizes.map((s) => (s.width && s.height ? s.width / s.height : 0));
  const widths = sizes.map(sideWidth);
  const close = (values: number[]) => Math.min(...values) >= (1 - ALIKE) * Math.max(...values);
  return ratios.every(Boolean) && close(ratios) && close(widths);
}

/**
 * Runs of figures alike, with nothing between them but their source lines: each source line goes into its figure, so
 * that it shows with its slide. Any text between two figures keeps them apart, so nothing is reordered.
 */
function joinGalleries(root: DocumentFragment) {
  let run: HTMLElement[] = [];
  const close = () => {
    if (run.length > 1) makeGallery(run);
    run = [];
  };
  for (const el of [...root.children]) {
    if (el.matches(FLOW_FIGURE) && el instanceof HTMLElement) {
      if (!alike([...run, el].map(sizeOf))) close();
      run.push(el);
    } else if (el.matches(SOURCE) && run.length && el.previousElementSibling === run.at(-1)) {
      run.at(-1)!.append(el);
    } else {
      close();
    }
  }
  close();
  // A source line taken in by a figure that stayed alone goes back after it.
  for (const figure of [...root.children].filter((e) => e.matches(FLOW_FIGURE))) {
    if (!figure.matches('.gallery')) figure.after(...figure.querySelectorAll(`:scope > ${SOURCE}`));
  }
}

/** Its width across the column: a plate's or a panorama's as `figureLayout` gives it, else its share or its pixels. */
function widthWhenWide(figure: HTMLElement, size: FigureSize): number {
  if (size.plate || labelsAtSide(size) === 0) return figureLayout(size).width;
  const share = Number.parseFloat(figure.style.width) || 100;
  return Math.min((COLUMN_PX * Math.min(100, share)) / 100, size.width ?? COLUMN_PX);
}

function lay(el: HTMLElement, sizes: FigureSize[], width: number, wide: boolean) {
  el.classList.add(wide ? 'is-wide' : 'is-thumb');
  for (const figure of [el, ...el.querySelectorAll<HTMLElement>('.gallery-slide')]) {
    figure.style.removeProperty('width');
  }
  el.style.setProperty('--fig', toRem(width));
  const ratios = sizes.flatMap((s) => (s.width && s.height ? [s.width / s.height] : []));
  if (ratios.length) {
    el.style.setProperty('--ar', String(Math.round(Math.min(...ratios) * 1000) / 1000));
  }
}

function sideWidth(size: FigureSize): number {
  const width = size.plate ? (size.width ?? SIDE_PX) : figureLayout(size).width;
  return Math.min(SIDE_PX, width);
}
