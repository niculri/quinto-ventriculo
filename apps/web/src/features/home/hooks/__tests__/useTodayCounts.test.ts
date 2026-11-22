// Tests the counts of «Hoy»: they show the clock of the moment a card comes due or the data changes, and nothing is
// scheduled when no card can come due.
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
    expect(counted(result)).toBe(START);
    act(() => {
      vi.advanceTimersByTime(DUE_IN_MS + 100);
    });
    expect(counted(result)).toBe(START + DUE_IN_MS + 100);
  });

  it('are computed again with the clock of then when the data changes', () => {
    const { result, rerender } = renderHook(() => useTodayCounts(COURSES));
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    home.study = {
      home: { decks: new Map(), truncated: false },
      base: { prefs: { learnAheadMinutes: 20 } },
      catalogDecks: [],
    };
    rerender();
    expect(counted(result)).toBe(START + 10_000);
  });

  it('wait for nothing when no card can come due', () => {
    fns.nextChangeAt.mockReturnValue(null);
    const { result } = renderHook(() => useTodayCounts(COURSES));
    expect(vi.getTimerCount()).toBe(0);
    expect(counted(result)).toBe(START);
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
