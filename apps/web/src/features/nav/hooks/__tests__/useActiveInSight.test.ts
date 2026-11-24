// Tests how far the menu scrolls to show the link of the page open.
import { describe, expect, it } from 'vitest';
import { scrollToShow } from '../useActiveInSight';

const box = DOMRect.fromRect({ y: 100, height: 500 });
const at = (y: number) => DOMRect.fromRect({ y, height: 30 });

describe('scrollToShow', () => {
  it('nothing when the row is in the menu, up or down the least to show it when not', () => {
    expect(scrollToShow(at(300), box)).toBe(0);
    expect(scrollToShow(at(100), box)).toBe(0);
    expect(scrollToShow(at(570), box)).toBe(0);
    expect(scrollToShow(at(40), box)).toBe(-60);
    expect(scrollToShow(at(700), box)).toBe(130);
  });
});
