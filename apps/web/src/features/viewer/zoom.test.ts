import { describe, expect, it } from 'vitest';
import {
  clampView,
  fitScale,
  fitView,
  isFitted,
  maxScale,
  panBy,
  pinch,
  toggledScale,
  zoomAt,
} from './zoom';

const plate = { width: 2000, height: 1500 };
const phone = { width: 375, height: 600 };

describe('the image viewer’s geometry', () => {
  it('fits the whole image, centered, never above its natural size', () => {
    expect(fitScale(plate, phone)).toBeCloseTo(0.1875);
    const v = fitView(plate, phone);
    expect(v.x).toBeCloseTo(0);
    expect(v.y).toBeCloseTo((600 - 1500 * 0.1875) / 2);
    expect(fitScale({ width: 100, height: 50 }, phone)).toBe(1);
    expect(maxScale(plate, phone)).toBe(2);
    expect(maxScale({ width: 100, height: 50 }, phone)).toBe(4);
  });

  it('zooming keeps the point under the finger or the pointer in place', () => {
    const v = fitView(plate, phone);
    const at = { x: 200, y: 300 };
    const imageX = (at.x - v.x) / v.scale;
    const z = zoomAt(v, 1, at, plate, phone);
    expect(z.scale).toBe(1);
    expect((at.x - z.x) / z.scale).toBeCloseTo(imageX);
    // Beyond the limits it stops at them, and the point still stays.
    const far = zoomAt(z, 50, at, plate, phone);
    expect(far.scale).toBe(2);
    expect((at.x - far.x) / far.scale).toBeCloseTo(imageX);
  });

  it('never leaves an empty border once it is bigger than the stage', () => {
    const z = { scale: 1, x: 100, y: 100 };
    expect(clampView(z, plate, phone)).toEqual({ scale: 1, x: 0, y: 0 });
    expect(panBy({ scale: 1, x: 0, y: 0 }, -5000, -5000, plate, phone)).toEqual({
      scale: 1,
      x: 375 - 2000,
      y: 600 - 1500,
    });
  });

  it('a double tap goes to the natural size and back to what fits', () => {
    const v = fitView(plate, phone);
    expect(isFitted(v, plate, phone)).toBe(true);
    expect(toggledScale(v, plate, phone)).toBe(1);
    expect(toggledScale({ ...v, scale: 0.6 }, plate, phone)).toBeCloseTo(0.1875);
    // A small image already at its size: twice.
    const small = { width: 200, height: 100 };
    expect(toggledScale(fitView(small, phone), small, phone)).toBe(2);
  });

  it('two fingers apart zoom in, together zoom out, down to what fits', () => {
    const v = fitView(plate, phone);
    const from: [{ x: number; y: number }, { x: number; y: number }] = [
      { x: 150, y: 300 },
      { x: 250, y: 300 },
    ];
    const apart = pinch(
      v,
      from,
      [
        { x: 100, y: 300 },
        { x: 300, y: 300 },
      ],
      plate,
      phone,
    );
    expect(apart.scale).toBeCloseTo(v.scale * 2);
    const together = pinch(
      v,
      from,
      [
        { x: 190, y: 300 },
        { x: 210, y: 300 },
      ],
      plate,
      phone,
    );
    expect(together.scale).toBeCloseTo(v.scale);
  });
});
