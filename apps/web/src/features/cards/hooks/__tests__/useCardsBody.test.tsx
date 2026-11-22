// Tests the cards page's state: a filter writes the URL at once (and an empty one leaves it), the table only in «Modo
// avanzado», a pasted code opens its card alone, and a lecture the list does not have has no title.
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CARD_INDEX } from '../../../../test/fixtures/cards';
import { CATALOG } from '../../../../test/fixtures/catalog';
import { cardsScope, lectureOf } from '../../../catalog/model/scope';
import { buildAnkiTree } from '../../../catalog/model/tree';
import type { CourseDeckNode } from '../../../catalog/model/tree';
import { explorerNotes } from '../../model/explorer';
import { useCardsBody } from '../useCardsBody';

const read = vi.hoisted(() => ({ data: undefined as unknown }));

vi.mock('../useCardsData', () => ({ useCardsData: () => ({ data: read.data }) }));
vi.mock('../useFailed', () => ({ useFailed: () => ({ data: new Set() }) }));
vi.mock('../useTextMatch', () => ({
  useTextMatch: () => ({ keys: null, error: null, waiting: false }),
}));
vi.mock('../useDayCards', () => ({ useDayCards: () => ({ value: null, waiting: false }) }));
vi.mock('../useThumbQuery', () => ({ useThumbQuery: () => null }));

const TREE = buildAnkiTree(CATALOG);
const NODE = TREE.nodes.find((n) => n.assessmentId === CARD_INDEX.assessmentId) as CourseDeckNode;
const SCOPE = cardsScope(CATALOG, NODE);
const notes = explorerNotes(
  [CARD_INDEX],
  (id) => lectureOf(TREE.byId.get(id))?.id ?? id,
  new Map(),
);

function body(url: string, fullAnki = false) {
  read.data = { notes, prefs: { fullAnki } };
  const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[url]}>{children}</MemoryRouter>
  );
  return renderHook(() => useCardsBody(SCOPE, TREE), { wrapper });
}

beforeEach(() => {
  read.data = undefined;
});

describe('the cards page’s URL', () => {
  it('takes a filter, and leaves it when the filter is emptied', () => {
    const { result } = body('/cards?q=x');
    act(() => result.current.set({ state: 'hard', kind: 'image' }));
    expect(result.current.params.toString()).toBe('q=x&state=hard&kind=image');
    expect(result.current.state).toBe('hard');
    act(() => result.current.set({ state: null, kind: '' }, false));
    expect(result.current.params.toString()).toBe('q=x');
  });

  it('shows the table only in «Modo avanzado»', () => {
    expect(body('/cards?view=table').result.current.table).toBe(false);
    expect(body('/cards?view=table', true).result.current.table).toBe(true);
    expect(body('/cards', true).result.current.table).toBe(false);
  });

  it('with a pasted code opens that card, alone', () => {
    const { result } = body('/cards?q=PR-01-002&state=new');
    expect(result.current.params.toString()).toBe(
      new URLSearchParams({ card: '0:cloze-1' }).toString(),
    );
  });

  it('with a text that is not a code keeps the search', () => {
    const { result } = body('/cards?q=v%C3%A9rtebra');
    expect(result.current.q).toBe('vértebra');
    expect(result.current.params.has('card')).toBe(false);
  });
});

describe('the lectures', () => {
  it('have their titles, and one the list does not have has none', () => {
    const { result } = body('/cards');
    expect(result.current.lectures.length).toBeGreaterThan(0);
    const id = result.current.lectures[0]!.id;
    expect(result.current.lectureTitles(id)).not.toBe('');
    expect(result.current.lectureTitles('nowhere')).toBe('');
  });

  it('are none while the data is on its way', () => {
    read.data = undefined;
    const wrapper = ({ children }: { children: ReactNode }) => (
      <MemoryRouter initialEntries={['/cards?q=PR-01-002']}>{children}</MemoryRouter>
    );
    const { result } = renderHook(() => useCardsBody(SCOPE, TREE), { wrapper });
    expect(result.current.lectures).toEqual([]);
    expect(result.current.result).toBeNull();
    expect(result.current.q).toBe('PR-01-002');
  });
});
