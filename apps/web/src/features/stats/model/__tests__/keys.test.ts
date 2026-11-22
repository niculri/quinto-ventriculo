// Tests where the heatmap's keys move the current day: a week sideways, a day up and down, the year's ends, kept inside.
import { yearGrid } from '@qv/study';
import { describe, expect, it } from 'vitest';
import { keyTarget } from '../keys';

const grid = yearGrid(2026);
const MID = grid.first + 100;

describe('the day a key goes to', () => {
  it.each([
    ['ArrowLeft', MID - 7],
    ['ArrowRight', MID + 7],
    ['ArrowUp', MID - 1],
    ['ArrowDown', MID + 1],
    ['Home', grid.first],
    ['End', grid.last],
  ])('%s from the middle of the year', (key, day) => {
    expect(keyTarget(key, MID, grid)).toBe(day);
  });

  it.each([
    ['ArrowLeft', grid.first + 3, grid.first],
    ['ArrowUp', grid.first, grid.first],
    ['ArrowRight', grid.last - 2, grid.last],
    ['ArrowDown', grid.last, grid.last],
  ])('%s near an end stops at the year’s edge', (key, from, day) => {
    expect(keyTarget(key, from, grid)).toBe(day);
  });

  it('is none for a key that does not move', () => {
    for (const key of ['Enter', 'a', 'PageDown', ' ']) expect(keyTarget(key, MID, grid)).toBeNull();
  });
});
