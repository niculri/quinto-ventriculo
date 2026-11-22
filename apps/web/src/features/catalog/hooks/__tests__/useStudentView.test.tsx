// Tests what the admin mode reads as the students have it: the published catalog and deck, a deck only the draft has,
// and whether the students have a thing.
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import type { Catalog, DeckDetail } from '@qv/schema';
import { adminKey } from '@qv/schema/http';
import { ApiClientContext } from '../../../../shared/hooks/useApi';
import { ApiRequestError } from '../../../../shared/lib/api';
import type { ApiClient } from '../../../../shared/lib/api';
import { fakeApi } from '../../../../test/fakes/api';
import { CATALOG } from '../../../../test/fixtures/catalog';
import { DECK } from '../../../../test/fixtures/deck';
import { useStudentCatalog, useStudentDeck, useStudentsHave } from '../useStudentView';

const ADMIN: Catalog = { ...CATALOG, adminOnly: { [adminKey('quiz', 'borrador')]: ['draft'] } };

function wrap(api: ApiClient) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <ApiClientContext value={api}>{children}</ApiClientContext>
    </QueryClientProvider>
  );
}

/** An API whose catalog is the admin mode's, and whose published deck answers with `published`. */
function adminApi(published: (id: string) => Promise<DeckDetail>) {
  const deck = vi.fn((id: string, _signal?: AbortSignal, op?: { published?: boolean }) =>
    op?.published ? published(id) : Promise.resolve(DECK),
  );
  const catalog = vi.fn((_signal?: AbortSignal, op?: { published?: boolean }) =>
    Promise.resolve(op?.published ? CATALOG : ADMIN),
  );
  return { api: fakeApi({ deck, catalog }), deck, catalog };
}

describe('useStudentDeck', () => {
  it('for a student, the deck itself, without asking for the published one', async () => {
    const deck = vi.fn(async () => DECK);
    const catalog = vi.fn(async () => CATALOG);
    const { result } = renderHook(() => useStudentDeck(DECK), {
      wrapper: wrap(fakeApi({ deck, catalog })),
    });
    await waitFor(() => expect(catalog).toHaveBeenCalled());
    expect(result.current).toMatchObject({ data: DECK, error: null, isError: false });
    result.current.refetch();
    expect(deck).not.toHaveBeenCalled();
  });

  it('in the admin mode, the deck as the students have it', async () => {
    const published = { ...DECK, cardCount: 1 };
    const { api, deck } = adminApi(async () => published);
    const { result } = renderHook(() => useStudentDeck(DECK), { wrapper: wrap(api) });
    await waitFor(() => expect(result.current.data).toEqual(published));
    expect(deck).toHaveBeenCalledWith('20', expect.anything(), { published: true });
    expect(result.current.isError).toBe(false);
  });

  it('a deck only the draft has is empty for the students, not an error', async () => {
    const { api } = adminApi(async () => {
      throw new ApiRequestError(404, 'not_found', 'Ese mazo no existe.');
    });
    const { result } = renderHook(() => useStudentDeck(DECK), { wrapper: wrap(api) });
    await waitFor(() => expect(result.current.data?.cardCount).toBe(0));
    expect(result.current.data).toMatchObject({
      id: '20',
      noteCount: 0,
      cardCount: 0,
      subdecks: [],
      cards: [],
    });
    expect(result.current).toMatchObject({ error: null, isError: false });
  });

  it('another error is an error, and «Reintentar» asks again', async () => {
    const fail = new ApiRequestError(500, 'internal', 'Falló.');
    const { api, deck } = adminApi(async () => {
      throw fail;
    });
    const { result } = renderHook(() => useStudentDeck(DECK), { wrapper: wrap(api) });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current).toMatchObject({ data: undefined, error: fail });
    const asked = deck.mock.calls.length;
    result.current.refetch();
    await waitFor(() => expect(deck.mock.calls.length).toBe(asked + 1));
  });

  it('without a deck yet, nothing is asked and there is nothing', async () => {
    const { api, catalog, deck } = adminApi(async () => DECK);
    const { result } = renderHook(() => useStudentDeck(undefined), { wrapper: wrap(api) });
    await waitFor(() => expect(catalog).toHaveBeenCalled());
    expect(result.current.data).toBeUndefined();
    expect(result.current.isError).toBe(false);
    expect(deck).not.toHaveBeenCalled();
  });
});

describe('useStudentCatalog', () => {
  it('in the admin mode, the published catalog; for a student, the catalog itself', async () => {
    const { api, catalog } = adminApi(async () => DECK);
    const admin = renderHook(() => useStudentCatalog(), { wrapper: wrap(api) });
    await waitFor(() => expect(admin.result.current.data).toBe(CATALOG));
    expect(catalog).toHaveBeenCalledWith(expect.anything(), { published: true });
    const student = renderHook(() => useStudentCatalog(), {
      wrapper: wrap(fakeApi({ catalog: async () => CATALOG })),
    });
    await waitFor(() => expect(student.result.current.data).toBe(CATALOG));
  });
});

describe('useStudentsHave', () => {
  it('only in the admin mode, and only what is not a draft', async () => {
    const { api } = adminApi(async () => DECK);
    const draft = renderHook(() => useStudentsHave(['quiz', 'borrador']), { wrapper: wrap(api) });
    const published = renderHook(() => useStudentsHave(['quiz', 'practica-biocel']), {
      wrapper: wrap(api),
    });
    await waitFor(() => expect(published.result.current).toBe(true));
    expect(draft.result.current).toBe(false);
    const student = renderHook(() => useStudentsHave(['quiz', 'practica-biocel']), {
      wrapper: wrap(fakeApi({ catalog: async () => CATALOG })),
    });
    await waitFor(() => expect(student.result.current).toBe(false));
  });
});
