// Tests ankiScreens: which screen a URL is for, that the other screens are fetched once, when nothing else loads, and
// what a screen whose chunk does not arrive does.
import { Suspense } from 'react';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CATALOG } from '../../test/fixtures/catalog';
import { fullAnkiStudy } from '../../test/fakes/repositories';
import { renderApp } from '../../test/render';
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
  it('fetches nothing when the browser says the person saves data', () => {
    const idle: (() => void)[] = [];
    vi.stubGlobal('requestIdleCallback', (cb: () => void) => idle.push(cb));
    vi.stubGlobal('cancelIdleCallback', () => undefined);
    vi.stubGlobal('navigator', { ...navigator, connection: { saveData: true } });
    const preloads = Object.values(ankiScreens).map((s) =>
      vi.spyOn(s, 'preload').mockResolvedValue(undefined),
    );
    render(
      <QueryClientProvider client={new QueryClient()}>
        <WarmScreens />
      </QueryClientProvider>,
    );
    idle.forEach((cb) => cb());
    expect(idle).toHaveLength(0);
    expect(preloads.every((p) => p.mock.calls.length === 0)).toBe(true);
  });

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

describe('the links of a deck’s page', () => {
  it('«Estudiar» has its screen fetched as a pointer reaches it, or the focus', async () => {
    const study = vi.spyOn(ankiScreens.study, 'preload');
    renderApp('/semesters/1/courses/anatomia-1/anki/certamen-1');
    const link = await screen.findByRole('link', { name: 'Estudiar' });
    study.mockClear();
    await userEvent.hover(link);
    expect(study).toHaveBeenCalledTimes(1);
    link.focus();
    expect(study).toHaveBeenCalledTimes(2);
  });

  it('with the data saver on, reaching «Estudiar» fetches nothing', async () => {
    const study = vi.spyOn(ankiScreens.study, 'preload');
    vi.stubGlobal('navigator', { ...navigator, connection: { saveData: true } });
    renderApp('/semesters/1/courses/anatomia-1/anki/certamen-1');
    const link = await screen.findByRole('link', { name: 'Estudiar' });
    study.mockClear();
    await userEvent.hover(link);
    link.focus();
    expect(study).not.toHaveBeenCalled();
  });

  it('«Repaso final» and the play link of each deck have their screens fetched too, never with the data saver on', async () => {
    const study = fullAnkiStudy();
    await study.recordReview({
      card: { noteGuid: 's@/AqX%n?#', ord: 0, deckId: '20' },
      expectedUpdatedAt: null,
      rating: 3,
      queueBefore: 'new',
      interval: 2,
      lastInterval: 0,
      durationMs: 4000,
      state: {
        phase: 'review',
        interday: true,
        remainingSteps: 0,
        due: new Date(Date.now() + 2 * 86_400_000).toISOString(),
        interval: 2,
        stability: 2.3,
        difficulty: 3,
        reps: 1,
        lapses: 0,
        lastReview: new Date().toISOString(),
        suspended: false,
        leech: false,
      },
      bury: [],
      buriedUntil: null,
    });
    const review = vi.spyOn(ankiScreens.review, 'preload');
    const studyScreen = vi.spyOn(ankiScreens.study, 'preload');
    renderApp(DECK, { study });
    const finalReview = await screen.findByRole('link', { name: 'Repaso final' });
    const tree = await screen.findByRole('list', { name: 'Submazos' });
    const play = (await within(tree).findAllByRole('link', { name: /^Estudiar / }))[0]!;
    review.mockClear();
    studyScreen.mockClear();
    await userEvent.hover(finalReview);
    finalReview.focus();
    expect(review).toHaveBeenCalledTimes(2);
    expect(studyScreen).not.toHaveBeenCalled();
    await userEvent.hover(play);
    play.focus();
    expect(studyScreen).toHaveBeenCalledTimes(2);
    expect(review).toHaveBeenCalledTimes(2);

    vi.stubGlobal('navigator', { ...navigator, connection: { saveData: true } });
    review.mockClear();
    studyScreen.mockClear();
    await userEvent.hover(finalReview);
    await userEvent.hover(play);
    expect(review).not.toHaveBeenCalled();
    expect(studyScreen).not.toHaveBeenCalled();
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
