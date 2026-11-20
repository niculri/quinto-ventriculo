// Tests ankiScreens: which screen a URL is for, that the other screens are fetched once, when nothing else loads, and
// what a screen whose chunk does not arrive does.
import { Suspense } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CATALOG } from '../../test/fixtures/catalog';
import { buildAnkiTree, hasPage } from '../../features/catalog/model/tree';
import type { CourseDeckNode } from '../../features/catalog/model/tree';
import { ankiScreens, lazyScreen, screenOfPath, WarmScreens } from '../ankiScreens';

const DECK = '/semesters/1/courses/anatomia-1/anki/certamen-1';
const NODE = buildAnkiTree(CATALOG).nodes.find((n): n is CourseDeckNode => hasPage(n))!;

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

describe('lazyScreen', () => {
  it('a chunk that does not arrive is the route’s error, asked for once per visit, and again on the next one', async () => {
    let fetches = 0;
    let arrives = false;
    const lazy = lazyScreen(() => {
      fetches++;
      return arrives ? Promise.resolve(() => <p>Pantalla</p>) : Promise.reject(new Error('chunk'));
    });
    await lazy.preload().catch(() => undefined);
    const router = createMemoryRouter(
      [
        {
          path: '*',
          element: (
            <Suspense fallback={<p>Cargando…</p>}>
              <lazy.Component node={NODE} />
            </Suspense>
          ),
          errorElement: <p>Algo salió mal</p>,
        },
      ],
      { initialEntries: ['/a'] },
    );
    await act(async () => {
      render(<RouterProvider router={router} />);
    });

    expect(await screen.findByText('Algo salió mal')).toBeInTheDocument();
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
    expect(fetches).toBe(2);

    arrives = true;
    await act(() => router.navigate('/b'));
    expect(await screen.findByText('Pantalla')).toBeInTheDocument();
    expect(fetches).toBe(3);
  });
});
