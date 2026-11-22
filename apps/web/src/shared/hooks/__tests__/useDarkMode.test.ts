// Tests that useDarkMode gives the theme of the page, follows every change of the `dark` class and stops watching when gone.
import { act, renderHook } from '@testing-library/react';
import { useLayoutEffect } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useDarkMode } from '../useDarkMode';

const root = document.documentElement;

afterEach(() => {
  root.classList.remove('dark');
  vi.restoreAllMocks();
});

describe('useDarkMode', () => {
  it('starts with the theme the page has', () => {
    expect(renderHook(() => useDarkMode()).result.current).toBe(false);
    root.classList.add('dark');
    expect(renderHook(() => useDarkMode()).result.current).toBe(true);
  });

  it('follows the class of <html> in both directions', async () => {
    const { result } = renderHook(() => useDarkMode());
    await act(async () => root.classList.add('dark'));
    expect(result.current).toBe(true);
    await act(async () => root.classList.remove('dark'));
    expect(result.current).toBe(false);
  });

  it('a change after the first render and before it starts watching is not lost', () => {
    const { result } = renderHook(() => {
      useLayoutEffect(() => root.classList.add('dark'), []);
      return useDarkMode();
    });
    expect(result.current).toBe(true);
  });

  it('stops watching when the component is gone', () => {
    const disconnect = vi.spyOn(MutationObserver.prototype, 'disconnect');
    const { unmount } = renderHook(() => useDarkMode());
    expect(disconnect).not.toHaveBeenCalled();
    unmount();
    expect(disconnect).toHaveBeenCalledTimes(1);
  });
});
