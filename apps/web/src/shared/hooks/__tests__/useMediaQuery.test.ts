// Tests following a media query: its value now, every change after, and the fallback where the browser cannot tell.
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useMediaQuery } from '../useMediaQuery';

function fakeQuery(initial: boolean) {
  const listeners = new Set<() => void>();
  const query = {
    matches: initial,
    addEventListener: (_: string, l: () => void) => listeners.add(l),
    removeEventListener: (_: string, l: () => void) => listeners.delete(l),
  };
  vi.spyOn(window, 'matchMedia').mockImplementation(() => query as unknown as MediaQueryList);
  return {
    listeners,
    change(matches: boolean) {
      query.matches = matches;
      for (const l of listeners) l();
    },
  };
}

afterEach(() => vi.restoreAllMocks());

describe('a media query', () => {
  it('starts with what matches now, follows each change and stops listening when gone', () => {
    const q = fakeQuery(true);
    const { result, unmount } = renderHook(() => useMediaQuery('(min-width: 40rem)', false));
    expect(result.current).toBe(true);
    act(() => q.change(false));
    expect(result.current).toBe(false);
    unmount();
    expect(q.listeners.size).toBe(0);
  });

  it('is the fallback where the browser has no matchMedia', () => {
    const original = window.matchMedia;
    // @ts-expect-error: a browser without matchMedia.
    delete window.matchMedia;
    try {
      expect(renderHook(() => useMediaQuery('(hover: hover)', true)).result.current).toBe(true);
      expect(renderHook(() => useMediaQuery('(hover: hover)', false)).result.current).toBe(false);
    } finally {
      window.matchMedia = original;
    }
  });
});
