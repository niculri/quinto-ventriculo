// Tests the shapes read from a card as Anki reads them, their colors and the size of the canvas.

import { describe, expect, it } from 'vitest';
import { SHAPE_MASK_COLOR, canvasPixelSize, shapeFromElement, shapeProperties } from '../shapes';
import { shapes } from './occlusion-fixtures';

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

  it('canvas size: fitted to the container, sharp, at most 4096²', () => {
    expect(canvasPixelSize({ width: 2000, height: 1000 }, { width: 500, height: 250 }, 2)).toEqual({
      width: 1000,
      height: 500,
    });
    const big = canvasPixelSize({ width: 10000, height: 10000 }, { width: 5000, height: 5000 }, 2);
    expect(big.width * big.height).toBeLessThanOrEqual(4096 * 4096);
  });
});
