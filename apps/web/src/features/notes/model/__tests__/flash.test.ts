// Tests the highlight that marks a section's heading on arriving at it.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flashHeading } from '../flash';

const rect = (left: number, top: number, width: number, height: number) =>
  ({
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
  }) as DOMRect;

let text = rect(0, 0, 0, 0);

beforeEach(() => {
  vi.useFakeTimers();
  Object.defineProperty(Range.prototype, 'getBoundingClientRect', {
    configurable: true,
    value: () => text,
  });
});

afterEach(() => {
  vi.useRealTimers();
  delete (Range.prototype as { getBoundingClientRect?: unknown }).getBoundingClientRect;
  document.body.innerHTML = '';
});

function heading() {
  const h = document.createElement('h2');
  h.textContent = 'Ribosomas';
  document.body.append(h);
  vi.spyOn(h, 'getBoundingClientRect').mockReturnValue(rect(100, 50, 600, 80));
  return h;
}

describe('flashHeading', () => {
  it('hugs the text with 6px around it, relative to the heading, and leaves after 2.3 s', () => {
    text = rect(120, 90, 200, 30);
    const h = heading();
    flashHeading(h);
    const mark = h.querySelector<HTMLElement>(':scope > .flash-mark')!;
    expect(mark).toHaveAttribute('aria-hidden', 'true');
    expect([mark.style.left, mark.style.top, mark.style.width, mark.style.height]).toEqual([
      '14px',
      '34px',
      '212px',
      '42px',
    ]);
    expect(h).toHaveClass('flash-host');
    vi.advanceTimersByTime(2299);
    expect(h.querySelector('.flash-mark')).not.toBeNull();
    vi.advanceTimersByTime(1);
    expect(h.querySelector('.flash-mark')).toBeNull();
    expect(h).not.toHaveClass('flash-host');
  });

  it('arriving again replaces the mark, and the old timer does not take the new one away', () => {
    text = rect(120, 90, 200, 30);
    const h = heading();
    flashHeading(h);
    vi.advanceTimersByTime(2000);
    flashHeading(h);
    expect(h.querySelectorAll('.flash-mark')).toHaveLength(1);
    vi.advanceTimersByTime(300);
    expect(h.querySelectorAll('.flash-mark')).toHaveLength(1);
    expect(h).toHaveClass('flash-host');
    vi.advanceTimersByTime(2000);
    expect(h.querySelector('.flash-mark')).toBeNull();
  });

  it.each([
    ['no width', rect(10, 10, 0, 20)],
    ['no height', rect(10, 10, 20, 0)],
  ])('a heading whose text has %s is not marked', (_, box) => {
    text = box;
    const h = heading();
    flashHeading(h);
    expect(h.querySelector('.flash-mark')).toBeNull();
    expect(h).not.toHaveClass('flash-host');
  });

  it('without text measuring there is no mark, and an old one still goes', () => {
    delete (Range.prototype as { getBoundingClientRect?: unknown }).getBoundingClientRect;
    const h = heading();
    const old = document.createElement('span');
    old.className = 'flash-mark';
    h.append(old);
    flashHeading(h);
    expect(h.querySelector('.flash-mark')).toBeNull();
  });
});
