// SPDX-License-Identifier: AGPL-3.0-or-later
// Portions derived from Anki (https://github.com/ankitects/anki), © Ankitects Pty Ltd and contributors,
// AGPL-3.0-or-later. Modified for El Quinto Ventrículo in 2026.

// Image Occlusion's shapes as Anki's reviewer reads them (ts/routes/image-occlusion/review.ts, Anki 25.09): from the
// hidden `div.cloze[data-shape]` of a card, in the image's fractions or in pixels, and their colors from the CSS.

export const SHAPE_MASK_COLOR = '#ffeba2';
const TEXT_FONT_SIZE = 40;
const TEXT_COLOR = '#000000';

interface BaseShape {
  left: number;
  top: number;
  angle: number;
  fill: string;
  occludeInactive: boolean;
  ordinal: number;
}
export type Shape =
  | (BaseShape & { type: 'rect'; width: number; height: number })
  | (BaseShape & { type: 'ellipse'; rx: number; ry: number })
  | (BaseShape & { type: 'polygon'; points: { x: number; y: number }[] })
  | (BaseShape & {
      type: 'text';
      text: string;
      scaleX: number;
      scaleY: number;
      fontSize: number | undefined;
    });

export interface Size {
  width: number;
  height: number;
}

const float = (v: string | undefined) => Number.parseFloat(v ?? '');
const position = (v: string | undefined) =>
  Number.parseFloat(v === undefined || Number.isNaN(Number(v)) ? '.0000' : v);
const storedToAngle = (v: string | undefined) => {
  const steps = Number(v) % 10000;
  return Number.isNaN(steps) ? 0 : (steps / 10000) * 360;
};

/** The shape of one rendered cloze (Anki's `extractShapeFromRenderedCloze`). */
export function shapeFromElement(el: HTMLElement): Shape | null {
  const d = el.dataset;
  const type = d.shape;
  const base = {
    left: position(d.left),
    top: position(d.top),
    angle: storedToAngle(d.angle),
    occludeInactive: d.occludeinactive === '1',
    ordinal: Number.parseInt(d.ordinal ?? '', 10),
  };
  const fill = d.fill;
  if (type === undefined) return null;
  switch (type) {
    case 'rect':
      return {
        ...base,
        type,
        fill: fill ?? SHAPE_MASK_COLOR,
        width: float(d.width),
        height: float(d.height),
      };
    case 'ellipse':
      return {
        ...base,
        type,
        fill: fill ?? SHAPE_MASK_COLOR,
        rx: float(d.rx),
        ry: float(d.ry),
      };
    case 'polygon': {
      const raw = d.points ?? '';
      const points = raw
        ? raw.split(' ').map((p) => {
            const [x, y] = p.split(',');
            return { x: Number(x), y: Number(y) };
          })
        : [{ x: 0, y: 0 }];
      return { ...base, type, fill: fill ?? SHAPE_MASK_COLOR, points };
    }
    case 'text': {
      const scale = float(d.scale);
      const fs = d.fontSize;
      return {
        ...base,
        type,
        fill: fill ?? TEXT_COLOR,
        text: d.text ?? '',
        scaleX: scale,
        scaleY: scale,
        fontSize: fs ? float(fs) : undefined,
      };
    }
    default:
      return null;
  }
}

export function shapesIn(root: ParentNode, selector: string): Shape[] {
  return [...root.querySelectorAll(selector)].flatMap((el) =>
    el instanceof HTMLDivElement ? (shapeFromElement(el) ?? []) : [],
  );
}

export function toAbsolute(shape: Shape, size: Size): Shape {
  const x = (v: number) => Math.round(v * size.width);
  const y = (v: number) => Math.round(v * size.height);
  const base = { left: x(shape.left), top: y(shape.top) };
  switch (shape.type) {
    case 'rect':
      return { ...shape, ...base, width: x(shape.width), height: y(shape.height) };
    case 'ellipse':
      return { ...shape, ...base, rx: x(shape.rx), ry: y(shape.ry) };
    case 'polygon':
      return { ...shape, ...base, points: shape.points.map((p) => ({ x: x(p.x), y: y(p.y) })) };
    case 'text':
      return {
        ...shape,
        ...base,
        fontSize: shape.fontSize ? shape.fontSize * size.height : TEXT_FONT_SIZE,
      };
  }
}

export interface ShapeProperties {
  activeShapeColor: string;
  inActiveShapeColor: string;
  highlightShapeColor: string;
  activeBorder: { width: number; color: string };
  inActiveBorder: { width: number; color: string };
  highlightShapeBorder: { width: number; color: string };
}

export function shapeProperties(
  style: Pick<CSSStyleDeclaration, 'getPropertyValue'>,
): ShapeProperties {
  const value = (name: string) => style.getPropertyValue(name).trim();
  const border = (name: string, fallback: string) => {
    const [width, color] = value(name).split(' ').filter(Boolean);
    const w = Number.parseFloat(width ?? '');
    return { width: Number.isNaN(w) ? 1 : w, color: color || fallback };
  };
  return {
    activeShapeColor: value('--active-shape-color') || '#ff8e8e',
    inActiveShapeColor: value('--inactive-shape-color') || SHAPE_MASK_COLOR,
    highlightShapeColor: value('--highlight-shape-color') || '#ff8e8e00',
    activeBorder: border('--active-shape-border', '#212121'),
    inActiveBorder: border('--inactive-shape-border', '#212121'),
    highlightShapeBorder: border('--highlight-shape-border', '#ff8e8e'),
  };
}

/** Anki's `optimumPixelSizeForCanvas`: the image fitted to the container, at most 4096 × 4096 device pixels. */
export function canvasPixelSize(image: Size, container: Size, pixelRatio: number): Size {
  const scale = Math.min(
    (container.width * pixelRatio) / image.width,
    (container.height * pixelRatio) / image.height,
  );
  let width = image.width * scale;
  let height = image.height * scale;
  const max = 4096 * 4096;
  if (width * height > max) {
    const shrink = Math.sqrt(max) / Math.sqrt(width * height);
    width *= shrink;
    height *= shrink;
  }
  return { width: Math.floor(width), height: Math.floor(height) };
}
