// Tests that warming the other screens is never the page's problem: a chunk that does not arrive is let go, and the
// others are still fetched; without `requestIdleCallback` (Safari), after a short wait.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ankiScreens } from '../ankiScreens';
import { WarmScreens } from '../WarmScreens';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('WarmScreens without an idle callback', () => {
  it('waits a moment, fetches every screen and lets go of one that fails', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('requestIdleCallback', undefined);
    const [first, ...rest] = Object.values(ankiScreens);
    const failing = vi.spyOn(first!, 'preload').mockRejectedValue(new Error('chunk'));
    const others = rest.map((s) => vi.spyOn(s, 'preload').mockResolvedValue(undefined));
    render(
      <QueryClientProvider client={new QueryClient()}>
        <WarmScreens />
      </QueryClientProvider>,
    );
    await act(() => vi.advanceTimersByTimeAsync(199));
    expect(failing).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(failing).toHaveBeenCalledTimes(1);
    expect(others.every((p) => p.mock.calls.length === 1)).toBe(true);
  });
});
