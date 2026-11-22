// Tests the folded decks remembered in this browser: what it reads back, and what happens when storage fails.

import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useCollapsed } from '../useCollapsed';

const KEY = 'qv-anki-collapsed';

afterEach(() => vi.restoreAllMocks());

describe('the folded decks', () => {
  it('folds and unfolds a deck, and a new visit reads it back', () => {
    const first = renderHook(() => useCollapsed());
    act(() => first.result.current.toggle('a'));
    act(() => first.result.current.toggle('b'));
    act(() => first.result.current.toggle('a'));
    expect([...first.result.current.collapsed]).toEqual(['b']);
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual(['b']);
    const again = renderHook(() => useCollapsed());
    expect([...again.result.current.collapsed]).toEqual(['b']);
  });

  it('what was saved broken starts with nothing folded', () => {
    localStorage.setItem(KEY, '[not json');
    expect(renderHook(() => useCollapsed()).result.current.collapsed.size).toBe(0);
  });

  it('with the storage blocked it still folds, for this visit', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    const { result } = renderHook(() => useCollapsed());
    act(() => result.current.toggle('a'));
    expect(result.current.collapsed.has('a')).toBe(true);
  });
});
