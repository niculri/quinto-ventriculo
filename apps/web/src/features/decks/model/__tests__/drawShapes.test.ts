// Tests the masks drawn as Anki's reviewer draws them: on the question, on the answer and with «toggle».

import { describe, expect, it } from 'vitest';
import { drawShapes } from '../drawShapes';
import type { ShapeProperties } from '../shapes';
import { shapes } from './occlusionFixtures';

function recorder() {
  const calls: string[] = [];
  const ctx = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    font: '',
    textBaseline: 'alphabetic' as CanvasTextBaseline,
    save: () => calls.push('save'),
    restore: () => calls.push('restore'),
    translate: (x: number, y: number) => calls.push(`translate ${x} ${y}`),
    rotate: (a: number) => calls.push(`rotate ${a.toFixed(4)}`),
    scale: (x: number, y: number) => calls.push(`scale ${x} ${y}`),
    fillRect(x: number, y: number, w: number, h: number) {
      calls.push(`fillRect ${x} ${y} ${w} ${h} ${this.fillStyle}`);
    },
    strokeRect(x: number, y: number, w: number, h: number) {
      calls.push(`strokeRect ${x} ${y} ${w} ${h} ${this.strokeStyle} ${this.lineWidth}`);
    },
    beginPath: () => calls.push('beginPath'),
    ellipse: (x: number, y: number, rx: number, ry: number) =>
      calls.push(`ellipse ${x} ${y} ${rx} ${ry}`),
    closePath: () => calls.push('closePath'),
    fill() {
      calls.push(`fill ${this.fillStyle}`);
    },
    stroke: () => calls.push('stroke'),
    moveTo: (x: number, y: number) => calls.push(`moveTo ${x} ${y}`),
    lineTo: (x: number, y: number) => calls.push(`lineTo ${x} ${y}`),
    measureText: (t: string) =>
      ({
        width: t.length * 10,
        actualBoundingBoxAscent: 8,
        actualBoundingBoxDescent: 2,
      }) as TextMetrics,
    fillText: (t: string, x: number, y: number) => calls.push(`fillText ${t} ${x} ${y}`),
    clearRect: () => calls.push('clearRect'),
  };
  return { ctx, calls };
}

const PROPS: ShapeProperties = {
  activeShapeColor: '#ff7b72',
  inActiveShapeColor: '#ffe08a',
  highlightShapeColor: '#ff7b7200',
  activeBorder: { width: 1, color: '#3d3d3d' },
  inActiveBorder: { width: 1, color: '#3d3d3d' },
  highlightShapeBorder: { width: 2, color: '#ff4f45' },
};

describe('image occlusion (like Anki review.ts)', () => {
  const size = { width: 1000, height: 500 };
  const rect = (cls: string, ord: number, extra = 'data-occludeinactive="1"') =>
    `<div class="${cls}" data-ordinal="${ord}" data-shape="rect" data-left=".1" data-top=".2" data-width=".3" data-height=".4" ${extra}></div>`;

  it('question: the active shape and the inactive ones with «hide all»', () => {
    const { ctx, calls } = recorder();
    drawShapes(
      ctx,
      shapes(
        rect('cloze', 1) +
          rect('cloze-inactive', 2) +
          rect('cloze-inactive', 3, '') +
          rect('cloze-inactive', 4, 'data-occludeinactive="1" data-fill="#00aaff"'),
      ),
      size,
      PROPS,
    );
    expect(calls.filter((c) => c.startsWith('fillRect'))).toEqual([
      'fillRect 100 100 300 200 #ff7b72',
      'fillRect 100 100 300 200 #ffe08a',
      'fillRect 100 100 300 200 #00aaff',
    ]);
    expect(calls).toContain('strokeRect 100 100 300 200 #3d3d3d 1');
  });

  it('answer: the active shape is uncovered with the highlight border', () => {
    const { ctx, calls } = recorder();
    drawShapes(ctx, shapes(rect('cloze-highlight', 1)), size, PROPS);
    expect(calls).toEqual([
      'fillRect 100 100 300 200 #ff7b7200',
      'strokeRect 100 100 300 200 #ff4f45 2',
    ]);
  });

  it('masks toggled off: only the text shapes', () => {
    const { ctx, calls } = recorder();
    const text =
      '<div class="cloze-inactive" data-ordinal="2" data-shape="text" data-left=".5" data-top=".5" data-text="Hola" data-scale="1" data-font-size=".04" data-occludeinactive="1"></div>';
    drawShapes(ctx, shapes(rect('cloze-highlight', 1) + text), size, PROPS, true);
    expect(calls).toContain('fillText Hola 500 250');
    expect(calls.some((c) => c.includes('#ff4f45'))).toBe(false);
    expect(ctx.font).toBe('20px Arial');
  });

  it('ellipses, polygons and rotated rectangles', () => {
    const { ctx, calls } = recorder();
    drawShapes(
      ctx,
      shapes(
        '<div class="cloze" data-ordinal="1" data-shape="ellipse" data-left=".1" data-top=".1" data-rx=".1" data-ry=".2"></div>' +
          '<div class="cloze" data-ordinal="1" data-shape="polygon" data-left=".2" data-top=".2" data-points=".2,.2 .3,.4 .2,.6"></div>' +
          '<div class="cloze" data-ordinal="1" data-shape="rect" data-left=".1" data-top=".1" data-width=".1" data-height=".1" data-angle="2500"></div>',
      ),
      size,
      PROPS,
    );
    expect(calls).toContain('ellipse 200 150 100 100');
    expect(calls).toContain('moveTo 200 100');
    expect(calls).toContain('lineTo 300 200');
    expect(calls).toContain(`rotate ${(Math.PI / 2).toFixed(4)}`);
  });
});
