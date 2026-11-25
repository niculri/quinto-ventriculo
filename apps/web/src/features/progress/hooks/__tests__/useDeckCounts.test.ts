// Tests a deck's counts: they show the clock of the moment a card comes due or the data changes, and nothing is
// scheduled when no card can come due.
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
  seenByDeck: vi.fn(),
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
  fns.seenByDeck.mockReset().mockReturnValue(new Map());
  fns.nextCountChange.mockReset().mockImplementation(() => Date.now() + DUE_IN_MS);
});
afterEach(() => vi.useRealTimers());

describe('the counts', () => {
  it('are computed again, with the clock of then, when a card comes due', () => {
    const { result } = renderHook(() => useDeckCounts(DECK));
    expect(result.current.counts?.get('d')).toBe(START);
    act(() => {
      vi.advanceTimersByTime(DUE_IN_MS + 100);
    });
    expect(result.current.counts?.get('d')).toBe(START + DUE_IN_MS + 100);
  });

  it('are computed again with the clock of then when the data changes', () => {
    const { result, rerender } = renderHook(() => useDeckCounts(DECK));
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    study.data = {};
    rerender();
    expect(result.current.counts?.get('d')).toBe(START + 10_000);
  });

  it('wait for nothing when no card can come due', () => {
    fns.nextCountChange.mockReturnValue(null);
    const { result } = renderHook(() => useDeckCounts(DECK));
    expect(vi.getTimerCount()).toBe(0);
    expect(result.current.counts?.get('d')).toBe(START);
  });
});
