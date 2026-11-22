// Tests the cards pages' data: the notes and cards are built once everything is read, and again exactly when what they
// are built from changes (the time, the student's rows, the author's presets…), not on any other render; an index the
// catalog names that is gone means the cards changed, other failures are the error, and a retry asks again only for
// what failed.
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError } from '../../../../shared/lib/api';
import type { AnkiTree } from '../../../catalog/model/tree';
import type { CardsScope } from '../../../catalog/model/scope';
import { useCardsData } from '../useCardsData';

const read = vi.hoisted(() => ({
  build: vi.fn<(sources: { authorPresets: unknown[] }) => unknown>(),
  index: vi.fn<(ref: { id: string }) => unknown>(),
  rows: vi.fn<() => unknown>(),
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
    cardIndexQuery: (_api: unknown, ref: { id: string }) =>
      queryOptions({ queryKey: ['index', ref.id], queryFn: () => read.index(ref) }),
    scopeRowsQuery: () => queryOptions({ queryKey: ['rows'], queryFn: () => read.rows() }),
  };
});

const SCOPE = {
  assessments: [{ id: 'a1', cardIndex: { hash: 'h' }, cardCount: 3 }],
  deckIds: ['d1'],
  node: { id: 'n1' },
} as unknown as CardsScope;
const TREE = { nodes: [] } as unknown as AnkiTree;
const AUTHOR = [{ name: 'Certamen', config: {} }];

function data(nowMs = 0, scope: CardsScope | null = SCOPE) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(({ now }) => useCardsData(scope, TREE, now), {
    wrapper,
    initialProps: { now: nowMs },
  });
}

beforeEach(() => {
  read.build.mockReset().mockImplementation(() => ({ built: read.build.mock.calls.length }));
  read.index.mockReset().mockImplementation(() => ['index']);
  read.rows.mockReset().mockImplementation(() => ['rows']);
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

const scopeWith = (assessments: unknown[]) => ({ ...SCOPE, assessments }) as unknown as CardsScope;

describe('what is missing', () => {
  it('is an assessment with cards and no index, not one whose decks have no cards', () => {
    const index = { id: 'a1', cardIndex: { hash: 'h' }, cardCount: 3 };
    expect(data(0, scopeWith([index, { id: 'a2', cardIndex: null, cardCount: 0 }])).result.current.missing).toBe(false);
    expect(data(0, scopeWith([index, { id: 'a2', cardIndex: null, cardCount: 4 }])).result.current.missing).toBe(true);
  });

  it('is nothing, and nothing is built, without a scope', async () => {
    const { result } = data(0, null);
    await act(() => Promise.resolve());
    expect(result.current).toMatchObject({ data: undefined, missing: false, changed: false, error: null });
    expect(read.index).not.toHaveBeenCalled();
  });
});

describe('a failure', () => {
  it('of an index that is gone (a 404) means the cards changed, and is not an error', async () => {
    read.index.mockRejectedValue(new ApiRequestError(404, 'not_found', 'x'));
    const { result } = data();
    await waitFor(() => expect(result.current.changed).toBe(true));
    expect(result.current.error).toBeNull();
    expect(result.current.data).toBeUndefined();
  });

  it('of an index for another reason is the error, and the data waits', async () => {
    const failure = new Error('offline');
    read.index.mockRejectedValue(failure);
    const { result } = data();
    await waitFor(() => expect(result.current.error).toBe(failure));
    expect(result.current.changed).toBe(false);
    expect(read.build).not.toHaveBeenCalled();
  });

  it('of the student’s rows is the error', async () => {
    const failure = new Error('rows');
    read.rows.mockRejectedValue(failure);
    const { result } = data();
    await waitFor(() => expect(result.current.error).toBe(failure));
  });

  it('is asked again on a retry, only what failed', async () => {
    const twoIndexes = scopeWith([
      { id: 'a1', cardIndex: { hash: 'h' }, cardCount: 3 },
      { id: 'a2', cardIndex: { hash: 'h2' }, cardCount: 3 },
    ]);
    read.index.mockImplementation((ref) =>
      ref.id === 'a2' ? Promise.reject(new Error('a2')) : ['index'],
    );
    read.rows.mockRejectedValueOnce(new Error('rows'));
    const { result } = data(0, twoIndexes);
    await waitFor(() => expect(result.current.error).toBeTruthy());
    await waitFor(() => expect(read.rows).toHaveBeenCalledTimes(1));
    read.index.mockImplementation(() => ['index']);
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(read.index.mock.calls.map(([r]) => r.id).sort()).toEqual(['a1', 'a2', 'a2']);
    expect(read.rows).toHaveBeenCalledTimes(2);
    expect(read.build.mock.calls[0]![0]).toMatchObject({ list: [['index'], ['index']] });
  });
});
