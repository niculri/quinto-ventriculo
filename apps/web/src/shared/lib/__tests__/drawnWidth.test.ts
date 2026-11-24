// Tests the width an image is drawn at: its box without its padding and border.
import { describe, expect, it } from 'vitest';
import { drawnWidth } from '../drawnWidth';

function image(clientWidth: number, style: string) {
  const img = document.createElement('img');
  img.setAttribute('style', style);
  Object.defineProperty(img, 'clientWidth', { value: clientWidth });
  return img;
}

describe('the width an image is drawn at', () => {
  it('leaves out its padding (the border is already out of clientWidth)', () => {
    expect(drawnWidth(image(312, 'padding: 6px; border: 1px solid'))).toBe(300);
    expect(drawnWidth(image(300, ''))).toBe(300);
  });

  it('is never below zero', () => {
    expect(drawnWidth(image(0, 'padding: 6px'))).toBe(0);
  });
});
