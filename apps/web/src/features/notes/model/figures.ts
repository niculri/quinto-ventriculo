// Sizes of an article's figures: thumbnails on the right with the text around them, as on Wikipedia, or wide and
// centered for large plates (`{88%!}`) and panoramas. Widths in CSS px; the CSS keeps them inside the column.

export const COLUMN_PX = 848;
/** Every thumbnail covers about the area of a 4:3 image 300px wide, as Wikipedia's «upright». */
const THUMB_AREA = 300 * 225;
/** A tall diagram stays readable; half the column leaves the text beside it 50 letters a line. */
export const THUMB_MIN_PX = 180;
export const THUMB_MAX_PX = COLUMN_PX / 2;
/** Wider than this ratio, a thumbnail would be a strip under 170px tall. */
export const PANORAMA = 2.4;
export const PANORAMA_MAX_PX = 600;
const ROW_GAP_PX = 16;

export interface FigureSize {
  plate?: boolean;
  /** A plate's width in the column, from its `{NN%!}`: what makes its labels read like the text. */
  percent?: number;
  width?: number;
  height?: number;
}

export interface FigureLayout {
  kind: 'thumb' | 'wide';
  width: number;
}

const known = (s: FigureSize): s is FigureSize & { width: number; height: number } =>
  !!s.width && !!s.height && s.width > 0 && s.height > 0;

export function figureLayout(size: FigureSize): FigureLayout {
  const plateWidth = size.percent ? (COLUMN_PX * Math.min(100, size.percent)) / 100 : COLUMN_PX;
  if (!known(size))
    return size.plate ? { kind: 'wide', width: plateWidth } : { kind: 'thumb', width: 300 };
  const ratio = size.width / size.height;
  if (size.plate) {
    return { kind: 'wide', width: size.percent ? Math.min(size.width, plateWidth) : size.width };
  }
  if (ratio >= PANORAMA) return { kind: 'wide', width: Math.min(size.width, PANORAMA_MAX_PX) };
  const width = Math.max(THUMB_MIN_PX, Math.min(THUMB_MAX_PX, Math.sqrt(THUMB_AREA * ratio)));
  return { kind: 'thumb', width: Math.min(width, size.width) };
}

/** All of the same height, together as wide as the column, and never enlarged past their pixels. */
export function rowWidths(sizes: FigureSize[]): number[] {
  if (!sizes.length) return [];
  const free = COLUMN_PX - ROW_GAP_PX * (sizes.length - 1);
  if (!sizes.every(known)) return sizes.map(() => free / sizes.length);
  const ratios = sizes.map((s) => s.width / s.height);
  const height = Math.min(free / ratios.reduce((a, b) => a + b, 0), ...sizes.map((s) => s.height));
  return ratios.map((r) => r * height);
}

export const toRem = (px: number) => `${Math.round((px / 16) * 100) / 100}rem`;
