// The image viewer's geometry: fit, limits, zoom around a point, double tap and pinch.
import { describe, expect, it } from 'vitest';
import {
  clampView,
  fitScale,
  fitView,
  isFitted,
  maxScale,
  openView,
  panBy,
  pinch,
  toggledScale,
  zoomAt,
} from '../zoom';

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

  it('two fingers that start on the same spot zoom as if they were a pixel apart, never to infinity', () => {
    const v = fitView(plate, phone);
    const spot = { x: 200, y: 300 };
    const out = pinch(
      v,
      [spot, spot],
      [
        { x: 199, y: 300 },
        { x: 201, y: 300 },
      ],
      plate,
      phone,
    );
    expect(out.scale).toBeCloseTo(v.scale * 2);
    expect(Number.isFinite(out.x)).toBe(true);
  });

  it('opens as it fits, unless the image was shown bigger: then as wide as it can, from its top', () => {
    const tall = { width: 870, height: 1547 };
    const notebook = { width: 1440, height: 630 };
    expect(openView(tall, notebook)).toEqual(fitView(tall, notebook));
    expect(openView(tall, notebook, 200)).toEqual(fitView(tall, notebook));
    const opened = openView(tall, notebook, 368);
    expect(opened.scale).toBe(1);
    expect(opened.y).toBe(0);
    expect(opened.x).toBeCloseTo((1440 - 870) / 2);
    expect(tall.width * opened.scale).toBeGreaterThan(368);
  });

  it('never opens smaller than it was shown, nor past the zoom limit', () => {
    const small = { width: 300, height: 900 };
    const narrow = { width: 200, height: 400 };
    expect(openView(small, narrow, 250).scale).toBeCloseTo(250 / 300);
    expect(openView(small, narrow, 300 * 9).scale).toBe(maxScale(small, narrow));
  });

  it('with a point to open on (an occlusion’s mask): at its natural size, that point in the middle', () => {
    const plate = { width: 1200, height: 800 };
    const phone = { width: 390, height: 700 };
    const opened = openView(plate, phone, 356, { x: 0.25, y: 0.5 });
    expect(opened.scale).toBe(1);
    expect(opened.x + 0.25 * 1200).toBeCloseTo(195);
    expect(opened.y + 0.5 * 800).toBeCloseTo(350);
    // At an edge it stays in bounds, and an image smaller than the stage is centered as it fits.
    expect(openView(plate, phone, 356, { x: 0, y: 0 })).toMatchObject({ x: 0, y: 0 });
    const small = { width: 200, height: 100 };
    expect(openView(small, phone, 100, { x: 0.9, y: 0.9 })).toEqual(fitView(small, phone));
  });
});
