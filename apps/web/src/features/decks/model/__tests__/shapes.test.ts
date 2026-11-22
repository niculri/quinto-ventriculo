// Tests the shapes read from a card as Anki reads them, their colors and the size of the canvas.

import { describe, expect, it } from 'vitest';
import {
  SHAPE_MASK_COLOR,
  canvasPixelSize,
  shapeFromElement,
  shapeProperties,
  shapesIn,
  toAbsolute,
} from '../shapes';
import { shapes } from './occlusionFixtures';

describe('image occlusion (like Anki review.ts)', () => {
  it('reads the shapes like Anki (defaults, fill, angle)', () => {
    const el = shapes(
      '<div data-shape="rect" data-ordinal="3" data-left="x" data-width=".5" data-angle="500"></div>',
    ).firstElementChild as HTMLElement;
    expect(shapeFromElement(el)).toMatchObject({
      type: 'rect',
      left: 0,
      ordinal: 3,
      fill: SHAPE_MASK_COLOR,
      angle: 18,
      occludeInactive: false,
    });
    const bad = shapes('<div data-shape="star"></div>').firstElementChild as HTMLElement;
    expect(shapeFromElement(bad)).toBeNull();
  });

  it('colors from the CSS variables, with Anki defaults', () => {
    const style = (values: Record<string, string>) => ({
      getPropertyValue: (n: string) => values[n] ?? '',
    });
    expect(
      shapeProperties(
        style({ '--active-shape-color': ' #ff7b72', '--highlight-shape-border': '2px #ff4f45' }),
      ),
    ).toMatchObject({
      activeShapeColor: '#ff7b72',
      inActiveShapeColor: SHAPE_MASK_COLOR,
      highlightShapeBorder: { width: 2, color: '#ff4f45' },
      activeBorder: { width: 1, color: '#212121' },
    });
  });

  const one = (html: string) => shapeFromElement(shapes(html).firstElementChild as HTMLElement);

  it('a cloze without a shape is not a shape', () => {
    expect(one('<div data-ordinal="1" data-left=".1"></div>')).toBeNull();
  });

  it.each([
    [
      'a polygon reads its points as x,y pairs separated by spaces',
      '<div data-shape="polygon" data-points=".1,.2 .3,.4"></div>',
      {
        points: [
          { x: 0.1, y: 0.2 },
          { x: 0.3, y: 0.4 },
        ],
        fill: SHAPE_MASK_COLOR,
      },
    ],
    [
      'a polygon without points is one point at the corner',
      '<div data-shape="polygon"></div>',
      { points: [{ x: 0, y: 0 }] },
    ],
    [
      'a text without its text or font size is empty, black and of the default size',
      '<div data-shape="text" data-scale="2"></div>',
      { text: '', fill: '#000000', scaleX: 2, scaleY: 2, fontSize: undefined },
    ],
    [
      'a text keeps its own fill and font size',
      '<div data-shape="text" data-text="A" data-fill="#ff0000" data-font-size=".05"></div>',
      { text: 'A', fill: '#ff0000', fontSize: 0.05 },
    ],
    [
      'an ellipse with its own fill and radii',
      '<div data-shape="ellipse" data-rx=".2" data-ry=".1" data-fill="#00ff00"></div>',
      { rx: 0.2, ry: 0.1, fill: '#00ff00' },
    ],
    [
      'an angle wraps every 10000 steps',
      '<div data-shape="rect" data-angle="12500"></div>',
      { angle: 90 },
    ],
    [
      'an angle that is not a number is no rotation',
      '<div data-shape="rect" data-angle="x"></div>',
      { angle: 0 },
    ],
  ])('%s', (_, html, expected) => {
    expect(one(html)).toMatchObject(expected);
  });

  it('only the div clozes of the selector are read, and the ones that are not shapes are skipped', () => {
    const root = shapes(
      '<div class="cloze" data-shape="rect" data-ordinal="1"></div>' +
        '<span class="cloze" data-shape="rect" data-ordinal="2"></span>' +
        '<div class="cloze" data-shape="star" data-ordinal="3"></div>' +
        '<div class="cloze-inactive" data-shape="rect" data-ordinal="4"></div>',
    );
    expect(shapesIn(root, '.cloze').map((s) => s.ordinal)).toEqual([1]);
  });

  it('to pixels: rounds each fraction to the image size, and a text without size takes 40 px', () => {
    const size = { width: 1000, height: 500 };
    const polygon = one('<div data-shape="polygon" data-left=".1234" data-points=".5,.5"></div>')!;
    expect(toAbsolute(polygon, size)).toMatchObject({ left: 123, points: [{ x: 500, y: 250 }] });
    const ellipse = one('<div data-shape="ellipse" data-rx=".1" data-ry=".1"></div>')!;
    expect(toAbsolute(ellipse, size)).toMatchObject({ rx: 100, ry: 50 });
    expect(toAbsolute(one('<div data-shape="text"></div>')!, size)).toMatchObject({ fontSize: 40 });
    const sized = one('<div data-shape="text" data-font-size=".1"></div>')!;
    expect(toAbsolute(sized, size)).toMatchObject({ fontSize: 50 });
  });

  it('a border without a color or width keeps the default of each', () => {
    const style = (values: Record<string, string>) => ({
      getPropertyValue: (n: string) => values[n] ?? '',
    });
    expect(
      shapeProperties(
        style({ '--active-shape-border': '3px', '--inactive-shape-border': 'thin #333333' }),
      ),
    ).toMatchObject({
      activeBorder: { width: 3, color: '#212121' },
      inActiveBorder: { width: 1, color: '#333333' },
    });
  });

  it('canvas size: fitted to the container, sharp, at most 4096²', () => {
    expect(canvasPixelSize({ width: 2000, height: 1000 }, { width: 500, height: 250 }, 2)).toEqual({
      width: 1000,
      height: 500,
    });
    const big = canvasPixelSize({ width: 10000, height: 10000 }, { width: 5000, height: 5000 }, 2);
    expect(big.width * big.height).toBeLessThanOrEqual(4096 * 4096);
  });
});
