/**
 * How an article's figures are drawn: most as thumbnails on the right with the text around them, like Wikipedia's;
 * the wide ones (a large plate, `{88%!}`, or a panorama) centered below them, so that their labels can be read. Widths in CSS px; the CSS keeps them inside the actual column.
 */

/** The article column on a computer, in CSS px (53rem). */
export const COLUMN_PX = 848;
/**
 * A thumbnail covers about the same area whatever its shape (300 × 225, a 4:3 image 300px wide), so that a wide one
 * gets wider and a tall one narrower, as Wikipedia's «upright».
 */
const THUMB_AREA = 300 * 225;
/**
 * Never narrower than this (a tall diagram stays readable: the tallest image of the articles, 0.45 as wide as tall,
 * is 400px tall) nor wider than half the column, so that the text beside it keeps 50 letters a line.
 */
export const THUMB_MIN_PX = 180;
export const THUMB_MAX_PX = COLUMN_PX / 2;
/**
 * An image this many times wider than tall would be a strip under 170px tall as a thumbnail: it goes wide, centered,
 * up to 600px (a strip of three lines of letters needs no more). A large plate takes the whole column.
 */
export const PANORAMA = 2.4;
export const PANORAMA_MAX_PX = 600;
/** The gap between the figures of a row (1rem). */
const ROW_GAP_PX = 16;

export interface FigureSize {
  /** A large plate (`{88%!}`): across the column. */
  plate?: boolean;
  /** The image's pixels (its `width` and `height` attributes). */
  width?: number;
  height?: number;
}

export interface FigureLayout {
  kind: 'thumb' | 'wide';
  /** Its width (px) where it has room: never wider than its pixels. */
  width: number;
}

const known = (s: FigureSize): s is FigureSize & { width: number; height: number } =>
  !!s.width && !!s.height && s.width > 0 && s.height > 0;

/** A thumbnail on the right, or across the column if it is a large plate or a panorama. */
export function figureLayout(size: FigureSize): FigureLayout {
  if (!known(size))
    return size.plate ? { kind: 'wide', width: COLUMN_PX } : { kind: 'thumb', width: 300 };
  const ratio = size.width / size.height;
  if (size.plate) return { kind: 'wide', width: size.width };
  if (ratio >= PANORAMA) return { kind: 'wide', width: Math.min(size.width, PANORAMA_MAX_PX) };
  const width = Math.max(THUMB_MIN_PX, Math.min(THUMB_MAX_PX, Math.sqrt(THUMB_AREA * ratio)));
  return { kind: 'thumb', width: Math.min(width, size.width) };
}

/**
 * The widths of a row's figures (px): all of the same height, together as wide as the column (gaps included), and
 * no taller than the smallest image's pixels (never enlarged).
 */
export function rowWidths(sizes: FigureSize[]): number[] {
  if (!sizes.length) return [];
  const free = COLUMN_PX - ROW_GAP_PX * (sizes.length - 1);
  if (!sizes.every(known)) return sizes.map(() => free / sizes.length);
  const ratios = sizes.map((s) => s.width! / s.height!);
  const height = Math.min(free / ratios.reduce((a, b) => a + b, 0), ...sizes.map((s) => s.height!));
  return ratios.map((r) => r * height);
}

/** As a CSS length that follows the root font size, like the page's width. */
export const toRem = (px: number) => `${Math.round((px / 16) * 100) / 100}rem`;
