// Tests a deck's counts: they are computed again when a card comes due, with the clock of then, and not on any other
// render, even though the data did not change.
import { act, renderHook } from '@testing-library/react';
import type { DeckDetail } from '@qv/schema';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDeckCounts } from '../useDeckCounts';

const DUE_IN_MS = 60_000;
const START = Date.parse('2026-11-21T15:00:00Z');

const study = vi.hoisted((): { data: object | undefined } => ({ data: {} }));
const fns = vi.hoisted(() => ({
  deckCounts: vi.fn(),
  masteryByDeck: vi.fn(),
  nextCountChange: vi.fn(),
}));

vi.mock('../../queries', () => ({
  useStudyData: () => ({ data: study.data, error: null, retry: () => undefined }),
}));
vi.mock('@qv/study', () => fns);

const DECK = { id: 'deck' } as DeckDetail;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(START);
  study.data = {};
  fns.deckCounts
    .mockReset()
    .mockImplementation((_data: object, now: number = Date.now()) => new Map([['d', now]]));
  fns.masteryByDeck.mockReset().mockReturnValue(new Map());
  fns.nextCountChange.mockReset().mockImplementation(() => Date.now() + DUE_IN_MS);
});
afterEach(() => vi.useRealTimers());

describe('the counts', () => {
  it('are computed again, with the clock of then, when a card comes due', () => {
    const { result } = renderHook(() => useDeckCounts(DECK));
    expect(fns.deckCounts).toHaveBeenCalledTimes(1);
    expect(result.current.counts?.get('d')).toBe(START);
    act(() => {
      vi.advanceTimersByTime(DUE_IN_MS + 100);
    });
    expect(fns.deckCounts).toHaveBeenCalledTimes(2);
    expect(result.current.counts?.get('d')).toBe(START + DUE_IN_MS + 100);
    expect(fns.masteryByDeck).toHaveBeenCalledTimes(2);
  });

  it('are computed again with the clock of then when the data changes, and not on another render', () => {
    const { result, rerender } = renderHook(() => useDeckCounts(DECK));
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    rerender();
    expect(fns.deckCounts).toHaveBeenCalledTimes(1);
    study.data = {};
    rerender();
    expect(fns.deckCounts).toHaveBeenCalledTimes(2);
    expect(result.current.counts?.get('d')).toBe(START + 10_000);
  });

  it('are not computed again with no card coming due', () => {
    fns.nextCountChange.mockReturnValue(null);
    renderHook(() => useDeckCounts(DECK));
    act(() => {
      vi.advanceTimersByTime(3_600_000);
    });
    expect(fns.deckCounts).toHaveBeenCalledTimes(1);
  });
});
