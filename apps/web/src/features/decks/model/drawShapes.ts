// SPDX-License-Identifier: AGPL-3.0-or-later
// Portions derived from Anki (https://github.com/ankitects/anki), © Ankitects Pty Ltd and contributors,
// AGPL-3.0-or-later. Modified for El Quinto Ventrículo in 2026.

// Image Occlusion's masks drawn on a canvas as Anki's reviewer draws them (ts/routes/image-occlusion/review.ts,
// Anki 25.09): the active shape, the inactive ones with «hide all» and the uncovered one with its border.

import { SHAPE_MASK_COLOR, shapesIn, toAbsolute } from './shapes';
import type { Shape, ShapeProperties, Size } from './shapes';

const TEXT_BACKGROUND_COLOR = '#ffffff';
const TEXT_FONT_FAMILY = 'Arial';
const TEXT_PADDING = 5;

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

type Of<T extends Shape['type']> = Extract<Shape, { type: T }>;

function rotated(ctx: Context, shape: Shape, angle: number, draw: () => void): void {
  if (angle) {
    ctx.save();
    ctx.translate(shape.left, shape.top);
    ctx.rotate(angle);
    ctx.translate(-shape.left, -shape.top);
  }
  draw();
  if (angle) ctx.restore();
}

function drawRect(ctx: Context, shape: Of<'rect'>, angle: number, strokeWidth: number): void {
  rotated(ctx, shape, angle, () => {
    ctx.fillRect(shape.left, shape.top, shape.width, shape.height);
    if (strokeWidth) ctx.strokeRect(shape.left, shape.top, shape.width, shape.height);
  });
}

function drawEllipse(ctx: Context, shape: Of<'ellipse'>, angle: number, strokeWidth: number): void {
  rotated(ctx, shape, angle, () => {
    ctx.beginPath();
    ctx.ellipse(shape.left + shape.rx, shape.top + shape.ry, shape.rx, shape.ry, 0, 0, Math.PI * 2);
    ctx.closePath();
    ctx.fill();
    if (strokeWidth) ctx.stroke();
  });
}

function drawPolygon(ctx: Context, shape: Of<'polygon'>, strokeWidth: number): void {
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
}

function drawText(ctx: Context, shape: Of<'text'>, angle: number): void {
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

function drawShape(
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
  if (shape.type === 'rect') drawRect(ctx, shape, angle, strokeWidth);
  else if (shape.type === 'ellipse') drawEllipse(ctx, shape, angle, strokeWidth);
  else if (shape.type === 'polygon') drawPolygon(ctx, shape, strokeWidth);
  else drawText(ctx, shape, angle);
}

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
