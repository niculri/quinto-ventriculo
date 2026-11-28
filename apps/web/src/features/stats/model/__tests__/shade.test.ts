// Tests the colors of the heatmap's days: turquoise steps for what was studied, and what is to come only as an outline,
// lighter than an empty day that passed.
import { describe, expect, it } from 'vitest';
import { LEGEND_LEVELS, legendShade, outline, shade } from '../shade';

describe('a day of the heatmap', () => {
  it('that passed: grey without answers, turquoise steps with them, and no outline', () => {
    expect(shade({ kind: 'past', value: 0, level: 0 })).toBe('var(--surface-2)');
    expect(shade({ kind: 'past', value: 9, level: 10 })).toBe(
      'color-mix(in oklab, var(--heat) 100%, var(--brand-soft))',
    );
    expect(outline({ kind: 'past', value: 9, level: 10 })).toBeNull();
  });

  it('to come: the card’s color with an outline, darker the more is due', () => {
    expect(shade({ kind: 'due', value: 0, level: 0 })).toBe('var(--surface)');
    expect(outline({ kind: 'due', value: 0, level: 0 })).toBe('inset 0 0 0 1px var(--border)');
    expect(outline({ kind: 'due', value: 5, level: 3 })).toBe(
      'inset 0 0 0 1px color-mix(in oklab, var(--muted) 32%, var(--border))',
    );
  });

  it('before the data comes: grey, without an outline', () => {
    expect(shade(null)).toBe('var(--surface-2)');
    expect(outline(null)).toBeNull();
  });

  it('the legend goes from no answers to the most', () => {
    expect(LEGEND_LEVELS.map(legendShade)[0]).toBe('var(--surface-2)');
    expect(legendShade(LEGEND_LEVELS.at(-1)!)).toBe(shade({ kind: 'past', value: 1, level: 10 }));
  });
});
