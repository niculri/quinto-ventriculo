// Tests the counts of «Hoy»: they are computed again when a card comes due, with the clock of then, and not on any
// other render, even though the data did not change.
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CourseDeckNode } from '../../../catalog/model/tree';
import { useTodayCounts } from '../useTodayCounts';

const DUE_IN_MS = 60_000;
const START = Date.parse('2026-11-21T15:00:00Z');

const home = vi.hoisted((): { study: object } => ({
  study: {
    home: { decks: new Map(), truncated: false },
    base: { prefs: { learnAheadMinutes: 20 } },
    catalogDecks: [],
  },
}));
const fns = vi.hoisted(() => ({ homeCourseCounts: vi.fn(), nextChangeAt: vi.fn() }));

vi.mock('../useHomeStudy', () => ({ useHomeStudy: () => home.study }));
vi.mock('@qv/study', () => fns);

const COURSES = [{ id: 'course' }] as CourseDeckNode[];

const counted = (result: { current: { results: Map<string, unknown> | null } }) =>
  result.current.results?.get('course');

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(START);
  fns.homeCourseCounts
    .mockReset()
    .mockImplementation(
      (_base: object, _id: string, _decks: object, _home: object, now: number = Date.now()) => now,
    );
  fns.nextChangeAt.mockReset().mockImplementation(() => Date.now() + DUE_IN_MS);
});
afterEach(() => vi.useRealTimers());

describe('the counts', () => {
  it('are computed again, with the clock of then, when a card comes due', () => {
    const { result } = renderHook(() => useTodayCounts(COURSES));
    expect(fns.homeCourseCounts).toHaveBeenCalledTimes(1);
    expect(counted(result)).toBe(START);
    act(() => {
      vi.advanceTimersByTime(DUE_IN_MS + 100);
    });
    expect(fns.homeCourseCounts).toHaveBeenCalledTimes(2);
    expect(counted(result)).toBe(START + DUE_IN_MS + 100);
  });

  it('are computed again with the clock of then when the data changes, and not on another render', () => {
    const { result, rerender } = renderHook(() => useTodayCounts(COURSES));
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    rerender();
    expect(fns.homeCourseCounts).toHaveBeenCalledTimes(1);
    home.study = {
      home: { decks: new Map(), truncated: false },
      base: { prefs: { learnAheadMinutes: 20 } },
      catalogDecks: [],
    };
    rerender();
    expect(fns.homeCourseCounts).toHaveBeenCalledTimes(2);
    expect(counted(result)).toBe(START + 10_000);
  });

  it('are not computed again with no card coming due', () => {
    fns.nextChangeAt.mockReturnValue(null);
    renderHook(() => useTodayCounts(COURSES));
    act(() => {
      vi.advanceTimersByTime(3_600_000);
    });
    expect(fns.homeCourseCounts).toHaveBeenCalledTimes(1);
  });

  it('with the home counts cut short, no course is counted here: each reads its own deck', () => {
    home.study = {
      home: { decks: new Map(), truncated: true },
      base: { prefs: { learnAheadMinutes: 20 } },
      catalogDecks: [],
    };
    const { result } = renderHook(() => useTodayCounts(COURSES));
    expect(result.current.results).toEqual(new Map([['course', null]]));
    expect(fns.homeCourseCounts).not.toHaveBeenCalled();
  });
});
