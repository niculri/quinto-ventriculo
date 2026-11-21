// Tests the one-time tips: at most one a visit, once per device, never again once closed.
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTip } from '../useTip';

const state = vi.hoisted(() => ({
  prefs: undefined as { dismissed: string[] } | undefined,
  save: vi.fn(),
}));

vi.mock('../../../progress/queries', () => ({
  usePreferences: () => ({ prefs: state.prefs }),
  useSavePreferences: () => ({ mutate: state.save }),
}));

const SHOWN = 'qv-tips-shown';
const VISIT = 'qv-tip';

beforeEach(() => {
  state.prefs = { dismissed: [] };
  state.save.mockReset();
  sessionStorage.clear();
});
afterEach(() => vi.restoreAllMocks());

describe('a tip', () => {
  it('waits for the action it is about, and then shows, once for this device', () => {
    const { result, rerender } = renderHook(({ done }) => useTip('tip-search', done), {
      initialProps: { done: false },
    });
    expect(result.current).toMatchObject({ slot: true, shown: false, show: false });
    expect(localStorage.getItem(SHOWN)).toBeNull();
    rerender({ done: true });
    expect(result.current).toMatchObject({ slot: true, shown: true, show: true });
    expect(sessionStorage.getItem(VISIT)).toBe('tip-search');
    expect(JSON.parse(localStorage.getItem(SHOWN)!)).toEqual(['tip-search']);
  });

  it('is added to the ones this device has seen, and not twice', () => {
    localStorage.setItem(SHOWN, JSON.stringify(['tip-material', 7]));
    const { rerender } = renderHook(({ done }) => useTip('tip-search', done), {
      initialProps: { done: true },
    });
    expect(JSON.parse(localStorage.getItem(SHOWN)!)).toEqual(['tip-material', 'tip-search']);
    rerender({ done: true });
    expect(JSON.parse(localStorage.getItem(SHOWN)!)).toEqual(['tip-material', 'tip-search']);
  });

  it('does not show a second time on this device, in another visit', () => {
    localStorage.setItem(SHOWN, JSON.stringify(['tip-search']));
    const { result } = renderHook(() => useTip('tip-search', true));
    expect(result.current).toMatchObject({ slot: false, show: false });
  });

  it('is the only one of the visit', () => {
    sessionStorage.setItem(VISIT, 'tip-material');
    const { result } = renderHook(() => useTip('tip-search', true));
    expect(result.current).toMatchObject({ slot: false, show: false });
    expect(JSON.parse(localStorage.getItem(SHOWN) ?? '[]')).toEqual([]);
  });

  it('does not show once closed for good, and closing it saves that', () => {
    const { result, rerender } = renderHook(() => useTip('tip-search', true));
    act(() => {
      result.current.close();
    });
    expect(state.save).toHaveBeenCalledWith({ dismissed: ['tip-search'] });
    state.prefs = { dismissed: ['tip-search'] };
    rerender();
    expect(result.current).toMatchObject({ show: false, shown: true });
    expect(renderHook(() => useTip('tip-search', true)).result.current.slot).toBe(false);
  });

  it('shows once preferences arrive, never before', () => {
    state.prefs = undefined;
    const { result, rerender } = renderHook(() => useTip('tip-search', true));
    expect(result.current).toMatchObject({ slot: false, show: false });
    state.prefs = { dismissed: [] };
    rerender();
    expect(result.current.show).toBe(true);
  });

  it('shows, and may show again, when the browser blocks its storage', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked', 'QuotaExceededError');
    });
    const { result } = renderHook(() => useTip('tip-search', true));
    expect(result.current.show).toBe(true);
    expect(localStorage.getItem(SHOWN)).toBeNull();
  });
});
