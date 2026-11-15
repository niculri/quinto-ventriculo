// Tests ankiScreens: which screen a URL is for, and that the other screens are fetched once, when nothing else loads.
import { act, render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ankiScreens, screenOfPath, WarmScreens } from '../ankiScreens';

const DECK = '/semesters/1/courses/anatomia-1/anki/certamen-1';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('screenOfPath', () => {
  it('the end of the URL says the screen; anything else is a deck page', () => {
    expect(screenOfPath(`${DECK}/study`)).toBe('study');
    expect(screenOfPath(`${DECK}/review`)).toBe('review');
    expect(screenOfPath(`${DECK}/cards`)).toBe('cards');
    expect(screenOfPath(`${DECK}/cards/practice`)).toBe('practice');
    expect(screenOfPath(DECK)).toBe('page');
    expect(screenOfPath(`${DECK}/s1-semana`)).toBe('page');
  });
});

describe('WarmScreens', () => {
  it('waits for the reads in progress, then fetches every screen once the browser is idle, and only once', async () => {
    const idle: (() => void)[] = [];
    vi.stubGlobal('requestIdleCallback', (cb: () => void) => idle.push(cb));
    vi.stubGlobal('cancelIdleCallback', () => undefined);
    const preloads = Object.values(ankiScreens).map((s) =>
      vi.spyOn(s, 'preload').mockResolvedValue(undefined),
    );
    const client = new QueryClient();
    let finish = () => {};
    void client.prefetchQuery({
      queryKey: ['slow'],
      queryFn: () => new Promise<number>((resolve) => (finish = () => resolve(1))),
    });
    const warm = () => (
      <QueryClientProvider client={client}>
        <WarmScreens />
      </QueryClientProvider>
    );

    const first = render(warm());
    expect(idle).toHaveLength(0);
    await act(async () => finish());
    await waitFor(() => expect(idle).toHaveLength(1));
    expect(preloads.every((p) => p.mock.calls.length === 0)).toBe(true);
    idle.forEach((cb) => cb());
    expect(preloads.map((p) => p.mock.calls.length)).toEqual([1, 1, 1, 1, 1]);

    first.unmount();
    render(warm());
    expect(idle).toHaveLength(1);
    expect(preloads.map((p) => p.mock.calls.length)).toEqual([1, 1, 1, 1, 1]);
  });
});
