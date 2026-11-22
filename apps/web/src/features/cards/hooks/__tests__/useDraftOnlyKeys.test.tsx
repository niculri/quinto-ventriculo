// Tests the cards only the draft has: none for a student, unknown until both lists are read, every card of the indexes
// when the students have no deck yet, and the error of a failed read kept apart from «they have none».
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { CardIndex } from '@qv/schema';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError } from '../../../../shared/lib/api';
import type { CardsScope } from '../../../catalog/model/scope';
import { cardKey } from '@qv/study';
import { useDraftOnlyKeys } from '../useDraftOnlyKeys';

const key = (noteGuid: string, ord: number) => cardKey({ noteGuid, ord });

const fake = vi.hoisted(() => ({ admin: true, deck: vi.fn() }));

vi.mock('../../../../shared/hooks/useApi', () => ({ useApi: () => ({ deck: fake.deck }) }));
vi.mock('../../../catalog/hooks/useStudentView', () => ({ useIsAdminCatalog: () => fake.admin }));

const SCOPE = { node: { id: 'd1' } } as unknown as CardsScope;
const INDEXES = [
  {
    notes: [
      { guid: 'a', cards: [{ ord: 0 }, { ord: 1 }] },
      { guid: 'b', cards: [{ ord: 0 }] },
    ],
  },
] as unknown as CardIndex[];

function keys(scope: CardsScope | null = SCOPE, ...rest: [CardIndex[] | undefined] | []) {
  const indexes = rest.length ? rest[0] : INDEXES;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(
    (p: { indexes: CardIndex[] | undefined }) => useDraftOnlyKeys(scope, p.indexes),
    {
      wrapper,
      initialProps: { indexes },
    },
  );
}

beforeEach(() => {
  fake.admin = true;
  fake.deck.mockReset().mockResolvedValue({ cards: [{ noteGuid: 'a', ord: 1 }] });
});

describe('the draft-only cards', () => {
  it('are always none for a student, who never asks for the students’ deck', () => {
    fake.admin = false;
    const { result } = keys();
    expect(result.current.keys?.size).toBe(0);
    expect(result.current.error).toBeNull();
    result.current.refetch();
    expect(fake.deck).not.toHaveBeenCalled();
  });

  it('are the cards of the indexes the students’ deck does not list', async () => {
    const { result } = keys();
    expect(result.current.keys).toBeUndefined();
    await waitFor(() => expect(result.current.keys).toBeDefined());
    expect([...result.current.keys!]).toEqual([key('a', 0), key('b', 0)]);
    expect(fake.deck).toHaveBeenCalledWith('d1', expect.anything(), { published: true });
  });

  it('stay unknown while the indexes are on their way, though the students’ deck is read', async () => {
    const { result, rerender } = keys(SCOPE, undefined);
    await waitFor(() => expect(fake.deck).toHaveBeenCalled());
    await act(() => Promise.resolve());
    expect(result.current.keys).toBeUndefined();
    rerender({ indexes: INDEXES });
    expect(result.current.keys?.size).toBe(2);
  });

  it('are every card when the students have no deck (a 404), which is not an error', async () => {
    fake.deck.mockRejectedValue(new ApiRequestError(404, 'not_found', 'x'));
    const { result } = keys();
    await waitFor(() => expect(result.current.keys).toBeDefined());
    expect([...result.current.keys!]).toEqual([key('a', 0), key('a', 1), key('b', 0)]);
    expect(result.current.error).toBeNull();
  });

  it('stay unknown after another failure, which is the error, and a retry asks again', async () => {
    const failure = new ApiRequestError(500, 'internal', 'x');
    fake.deck.mockRejectedValue(failure);
    const { result } = keys();
    await waitFor(() => expect(result.current.error).toBe(failure));
    expect(result.current.keys).toBeUndefined();
    act(() => result.current.refetch());
    await waitFor(() => expect(fake.deck).toHaveBeenCalledTimes(2));
  });

  it('never ask for a deck without a scope', async () => {
    const { result } = keys(null);
    await act(() => Promise.resolve());
    expect(fake.deck).not.toHaveBeenCalled();
    expect(result.current.keys).toBeUndefined();
  });
});
