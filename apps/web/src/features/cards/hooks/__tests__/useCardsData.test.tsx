// Tests the cards pages' data: the notes and cards are built once everything is read, and again exactly when what they
// are built from changes (the time, the student's rows, the author's presets…), not on any other render.
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnkiTree } from '../../../catalog/model/tree';
import type { CardsScope } from '../../../catalog/model/scope';
import { useCardsData } from '../useCardsData';

const read = vi.hoisted(() => ({
  build: vi.fn<(sources: { authorPresets: unknown[] }) => unknown>(),
  catalog: { data: undefined as { anki: { presets: unknown[] } } | undefined },
  prefs: { fullAnki: false },
  presets: { data: [] as unknown[] },
  settings: { data: [] as unknown[] },
}));

vi.mock('../../model/cardsData', () => ({ cardsData: read.build }));
vi.mock('../../../../shared/hooks/useApi', () => ({ useApi: () => ({}) }));
vi.mock('../../../progress/api/context', () => ({ useStudyRepository: () => ({}) }));
vi.mock('../../../catalog/hooks/useCatalog', () => ({ useCatalog: () => read.catalog }));
vi.mock('../../../progress/queries', () => ({
  usePreferences: () => ({ prefs: read.prefs }),
  useUserPresets: () => read.presets,
  useDeckSettings: () => read.settings,
}));
vi.mock('../../api/queries', async () => {
  const { queryOptions } = await import('@tanstack/react-query');
  return {
    cardIndexQuery: () => queryOptions({ queryKey: ['index'], queryFn: () => ['index'] }),
    scopeRowsQuery: () => queryOptions({ queryKey: ['rows'], queryFn: () => ['rows'] }),
  };
});

const SCOPE = {
  assessments: [{ id: 'a1', cardIndex: { hash: 'h' }, cardCount: 3 }],
  deckIds: ['d1'],
  node: { id: 'n1' },
} as unknown as CardsScope;
const TREE = { nodes: [] } as unknown as AnkiTree;
const AUTHOR = [{ name: 'Certamen', config: {} }];

function data(nowMs = 0) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(({ now }) => useCardsData(SCOPE, TREE, now), {
    wrapper,
    initialProps: { now: nowMs },
  });
}

beforeEach(() => {
  read.build.mockReset().mockImplementation(() => ({ built: read.build.mock.calls.length }));
  read.catalog.data = { anki: { presets: AUTHOR } };
  read.presets = { data: [] };
  read.settings = { data: [] };
});

describe('the data', () => {
  it('is built once everything is read, from the author’s presets and the time', async () => {
    const { result } = data(5);
    expect(result.current.data).toBeUndefined();
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(read.build).toHaveBeenCalledTimes(1);
    expect(read.build.mock.calls[0]![0]).toMatchObject({
      list: [['index']],
      rows: ['rows'],
      authorPresets: AUTHOR,
      nowMs: 5,
    });
  });

  it('is not built again by a render that changes nothing', async () => {
    const { result, rerender } = data(5);
    await waitFor(() => expect(result.current.data).toBeDefined());
    const first = result.current.data;
    rerender({ now: 5 });
    rerender({ now: 5 });
    expect(result.current.data).toBe(first);
    expect(read.build).toHaveBeenCalledTimes(1);
  });

  it('is built again when the time changes, as the due dates follow it', async () => {
    const { result, rerender } = data(5);
    await waitFor(() => expect(result.current.data).toBeDefined());
    rerender({ now: 60_005 });
    expect(read.build).toHaveBeenCalledTimes(2);
    expect(read.build.mock.calls[1]![0]).toMatchObject({ nowMs: 60_005 });
  });

  it('is built again when the student’s presets or settings change', async () => {
    const { result, rerender } = data(5);
    await waitFor(() => expect(result.current.data).toBeDefined());
    read.presets = { data: [{ id: 'u1' }] };
    rerender({ now: 5 });
    expect(read.build).toHaveBeenCalledTimes(2);
    read.settings = { data: [{ deckId: 'd1' }] };
    rerender({ now: 5 });
    expect(read.build).toHaveBeenCalledTimes(3);
  });

  it('reads the author’s presets that arrive after it was built', async () => {
    read.catalog.data = undefined;
    const { result, rerender } = data(5);
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(read.build.mock.calls[0]![0].authorPresets).toEqual([]);
    rerender({ now: 5 });
    expect(read.build).toHaveBeenCalledTimes(1);
    read.catalog.data = { anki: { presets: AUTHOR } };
    rerender({ now: 5 });
    expect(read.build).toHaveBeenCalledTimes(2);
    expect(read.build.mock.calls[1]![0].authorPresets).toBe(AUTHOR);
  });
});
