// SPDX-License-Identifier: AGPL-3.0-or-later
// Portions derived from Anki (https://github.com/ankitects/anki), © Ankitects Pty Ltd and contributors,
// AGPL-3.0-or-later. Modified for El Quinto Ventrículo in 2026.
/**
 * Image Occlusion as Anki's reviewer draws it (ts/routes/image-occlusion/review.ts, Anki 25.09): reads the
 * hidden `div.cloze[data-shape]` the template renders and paints the masks on the canvas over the image.
 * Works inside the card's Shadow DOM (everything is looked up from `root`, never from `document`).
 */

export const SHAPE_MASK_COLOR = '#ffeba2';
const TEXT_BACKGROUND_COLOR = '#ffffff';
const TEXT_FONT_FAMILY = 'Arial';
const TEXT_PADDING = 5;
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

interface Size {
  width: number;
  height: number;
}

const float = (v: string | undefined) => Number.parseFloat(v ?? '');
const position = (v: string | undefined) =>
  Number.parseFloat(v === undefined || Number.isNaN(Number(v)) ? '.0000' : v);
/** Stored angle (10 000 steps per turn) → degrees. */
const storedToAngle = (v: string | undefined) => {
  const steps = Number(v) % 10000;
  return Number.isNaN(steps) ? 0 : (steps / 10000) * 360;
};

/** The shape of one rendered cloze (Anki's `extractShapeFromRenderedCloze`). */
export function shapeFromElement(el: HTMLElement): Shape | null {
  const d = el.dataset;
  const type = d['shape'];
  const base = {
    left: position(d['left']),
    top: position(d['top']),
    angle: storedToAngle(d['angle']),
    occludeInactive: d['occludeinactive'] === '1',
    ordinal: Number.parseInt(d['ordinal'] ?? '', 10),
  };
  const fill = d['fill'];
  switch (type) {
    case 'rect':
      return {
        ...base,
        type,
        fill: fill ?? SHAPE_MASK_COLOR,
        width: float(d['width']),
        height: float(d['height']),
      };
    case 'ellipse':
      return {
        ...base,
        type,
        fill: fill ?? SHAPE_MASK_COLOR,
        rx: float(d['rx']),
        ry: float(d['ry']),
      };
    case 'polygon': {
      const raw = d['points'] ?? '';
      const points = raw
        ? raw.split(' ').map((p) => {
            const [x, y] = p.split(',');
            return { x: Number(x), y: Number(y) };
          })
        : [{ x: 0, y: 0 }];
      return { ...base, type, fill: fill ?? SHAPE_MASK_COLOR, points };
    }
    case 'text': {
      const scale = float(d['scale']);
      const fs = d['fontSize'];
      return {
        ...base,
        type,
        fill: fill ?? TEXT_COLOR,
        text: d['text'] ?? '',
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

/** From fractions of the image to canvas pixels (Anki rounds each value). */
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

/** The colors come from the CSS variables of the note type (`--active-shape-color`, etc.). */
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

type Context = Pick<
  CanvasRenderingContext2D,
  | 'fillStyle'
  | 'strokeStyle'
  | 'lineWidth'
  | 'font'
  | 'textBaseline'
  | 'save'
  | 'restore'
  | 'translate'
  | 'rotate'
  | 'scale'
  | 'fillRect'
  | 'strokeRect'
  | 'beginPath'
  | 'ellipse'
  | 'closePath'
  | 'fill'
  | 'stroke'
  | 'moveTo'
  | 'lineTo'
  | 'measureText'
  | 'fillText'
  | 'clearRect'
>;

export function drawShape(
  ctx: Context,
  size: Size,
  original: Shape,
  fill: string,
  stroke: string,
  strokeWidth: number,
): void {
  const shape = toAbsolute(original, size);
  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = strokeWidth;
  const angle = (shape.angle * Math.PI) / 180;
  const rotate = () => {
    ctx.save();
    ctx.translate(shape.left, shape.top);
    ctx.rotate(angle);
    ctx.translate(-shape.left, -shape.top);
  };
  if (shape.type === 'rect') {
    if (angle) rotate();
    ctx.fillRect(shape.left, shape.top, shape.width, shape.height);
    if (strokeWidth) ctx.strokeRect(shape.left, shape.top, shape.width, shape.height);
    if (angle) ctx.restore();
  } else if (shape.type === 'ellipse') {
    if (angle) rotate();
    ctx.beginPath();
    ctx.ellipse(shape.left + shape.rx, shape.top + shape.ry, shape.rx, shape.ry, 0, 0, Math.PI * 2);
    ctx.closePath();
    ctx.fill();
    if (strokeWidth) ctx.stroke();
    if (angle) ctx.restore();
  } else if (shape.type === 'polygon') {
    const topLeft = shape.points.reduce(
      (t, p) => ({ x: Math.min(t.x, p.x), y: Math.min(t.y, p.y) }),
      { ...shape.points[0]! },
    );
    ctx.save();
    ctx.translate(shape.left - topLeft.x, shape.top - topLeft.y);
    ctx.beginPath();
    ctx.moveTo(shape.points[0]!.x, shape.points[0]!.y);
    for (const p of shape.points) ctx.lineTo(p.x, p.y);
    ctx.closePath();
    ctx.fill();
    if (strokeWidth) ctx.stroke();
    ctx.restore();
  } else {
    ctx.save();
    ctx.font = `${shape.fontSize}px ${TEXT_FONT_FAMILY}`;
    ctx.textBaseline = 'top';
    ctx.scale(shape.scaleX, shape.scaleY);
    const lines = shape.text.split('\n');
    const m = ctx.measureText('M');
    const lineHeight = 1.5 * (m.actualBoundingBoxAscent + m.actualBoundingBoxDescent);
    const left = shape.left / shape.scaleX;
    const top = shape.top / shape.scaleY;
    const widths = lines.map((l) => ctx.measureText(l).width);
    if (angle) {
      ctx.translate(left, top);
      ctx.rotate(angle);
      ctx.translate(-left, -top);
    }
    ctx.fillStyle = TEXT_BACKGROUND_COLOR;
    ctx.fillRect(
      left,
      top,
      Math.max(0, ...widths) + TEXT_PADDING,
      lines.length * lineHeight + TEXT_PADDING,
    );
    ctx.fillStyle = shape.fill;
    lines.forEach((line, i) => ctx.fillText(line, left, top + i * lineHeight));
    ctx.restore();
  }
}

/**
 * Paints the masks: active ones (question), inactive ones with «hide all» (`oi=1`), and on the answer the
 * active one revealed with the highlight border. With `onlyText` (masks toggled off) only text shapes.
 */
export function drawShapes(
  ctx: Context,
  root: ParentNode,
  size: Size,
  properties: ShapeProperties,
  onlyText = false,
): void {
  const allowed = (s: Shape) => !onlyText || s.type === 'text';
  for (const s of shapesIn(root, '.cloze').filter(allowed)) {
    drawShape(
      ctx,
      size,
      s,
      properties.activeShapeColor,
      properties.activeBorder.color,
      properties.activeBorder.width,
    );
  }
  for (const s of shapesIn(root, '.cloze-inactive').filter(allowed)) {
    if (!s.occludeInactive) continue;
    drawShape(
      ctx,
      size,
      s,
      s.fill !== SHAPE_MASK_COLOR ? s.fill : properties.inActiveShapeColor,
      properties.inActiveBorder.color,
      properties.inActiveBorder.width,
    );
  }
  for (const s of shapesIn(root, '.cloze-highlight').filter(allowed)) {
    drawShape(
      ctx,
      size,
      s,
      properties.highlightShapeColor,
      properties.highlightShapeBorder.color,
      properties.highlightShapeBorder.width,
    );
  }
}

/**
 * Canvas size in device pixels: the image fitted to the container, at most 4096 × 4096 pixels
 * (Anki's `optimumPixelSizeForCanvas`).
 */
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

/**
 * Sets up the occlusion of a rendered card (Anki's `setupImageOcclusion`): fixes the container's aspect
 * ratio to the image's, sizes the canvas, draws, and wires the «toggle» button and the M key. Returns a
 * cleanup function.
 */
export function setupOcclusion(root: ShadowRoot | HTMLElement): () => void {
  const container = root.querySelector<HTMLDivElement>('#image-occlusion-container');
  const canvas = root.querySelector<HTMLCanvasElement>('#image-occlusion-canvas');
  const image = root.querySelector<HTMLImageElement>('#image-occlusion-container img');
  if (!container || !canvas) return () => {};
  if (!image) {
    container.textContent = 'No hay ninguna imagen que mostrar.';
    return () => {};
  }
  let hidden = false;
  let disposed = false;

  const draw = () => {
    if (disposed || !image.naturalWidth || !image.naturalHeight) return;
    container.style.aspectRatio = `${image.naturalWidth / image.naturalHeight}`;
    const size = canvasPixelSize(
      { width: image.naturalWidth, height: image.naturalHeight },
      { width: canvas.clientWidth, height: canvas.clientHeight },
      window.devicePixelRatio || 1,
    );
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawShapes(ctx, root, canvas, shapeProperties(getComputedStyle(canvas)), hidden);
  };

  const toggle = () => {
    hidden = !hidden;
    draw();
  };
  const button = root.querySelector<HTMLButtonElement>('#toggle');
  if (button) {
    if (root.querySelector('[data-occludeinactive="1"]')) button.addEventListener('click', toggle);
    else button.style.display = 'none';
  }
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'M' && button && button.style.display !== 'none') toggle();
  };
  window.addEventListener('keydown', onKey);

  // Like Anki: once the image has loaded, and again whenever the size changes.
  if (image.complete) requestAnimationFrame(draw);
  image.addEventListener('load', draw);
  const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => draw());
  observer?.observe(container);

  return () => {
    disposed = true;
    window.removeEventListener('keydown', onKey);
    image.removeEventListener('load', draw);
    button?.removeEventListener('click', toggle);
    observer?.disconnect();
  };
}
