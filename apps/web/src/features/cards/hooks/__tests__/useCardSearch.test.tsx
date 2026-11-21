// Tests the table's search: each step (the cards, the search over them, the sorted list) is built again exactly when
// what it reads changes, and not on any other render.
import { act, renderHook } from '@testing-library/react';
import { SearchError } from '@qv/anki-search';
import type { SchedTiming } from '@qv/srs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BrowseCard } from '../../model/browseCards';
import type { TableData } from '../../model/tableData';
import { useCardSearch } from '../useCardSearch';
import type { ViewPrefs } from '../useViewPrefs';

const steps = vi.hoisted(() => ({
  build: vi.fn(),
  match: vi.fn(),
  sort: vi.fn(),
}));

vi.mock('../useSearchHistory', () => ({
  useSearchHistory: () => ({ rated: undefined, introduced: undefined, waiting: false }),
}));
vi.mock('../../model/browseCards', () => ({
  buildBrowseCards: steps.build,
  notesOf: (cards: unknown[]) => cards.slice(0, 1),
}));
vi.mock('../../model/columns', () => ({ sortCards: steps.sort }));
vi.mock('../../model/search', async (original) => ({
  ...(await original<object>()),
  searchContext: () => ({}),
  matchCards: steps.match,
}));

const CARDS = [{ key: 'a' }, { key: 'b' }] as BrowseCard[];
const DATA = {
  notes: [],
  noteTypes: [],
  tree: { byId: new Map(), nodes: [] },
  rows: [],
  prefs: { learnAheadMinutes: 20 },
  decayOf: () => 0,
} as unknown as TableData;
const VIEW: ViewPrefs = {
  mode: 'cards',
  columns: [],
  sort: { column: 'sortField', descending: false },
};
const TIMING = { now: 1000 } as SchedTiming;

type Props = Parameters<typeof useCardSearch>[0];
const PROPS: Props = { data: DATA, query: 'deck:a', view: VIEW, timing: TIMING, now: 1 };

function search(props: Props = PROPS) {
  return renderHook((p: Props) => useCardSearch(p), { initialProps: props });
}

beforeEach(() => {
  steps.build.mockReset().mockImplementation(() => [...CARDS]);
  steps.match.mockReset().mockImplementation((_node, _ctx, cards: BrowseCard[]) => [...cards]);
  steps.sort.mockReset().mockImplementation((cards: BrowseCard[]) => [...cards].reverse());
});

const calls = () => [
  steps.build.mock.calls.length,
  steps.match.mock.calls.length,
  steps.sort.mock.calls.length,
];

describe('the list', () => {
  it('is the cards that match, sorted', () => {
    const { result } = search();
    expect(result.current.list.map((c) => c.key)).toEqual(['b', 'a']);
    expect(steps.sort).toHaveBeenCalledWith(CARDS, 'sortField', false, TIMING);
    expect(calls()).toEqual([1, 1, 1]);
  });

  it('is not built again by a render that changes nothing', () => {
    const { rerender } = search();
    rerender({ ...PROPS });
    rerender({ ...PROPS, view: { ...VIEW, columns: ['x' as never] } });
    expect(calls()).toEqual([1, 1, 1]);
  });

  it('is sorted again, and only sorted, when the sort or the mode changes', () => {
    const { rerender, result } = search();
    rerender({ ...PROPS, view: { ...VIEW, sort: { column: 'sortField', descending: true } } });
    expect(calls()).toEqual([1, 1, 2]);
    expect(steps.sort).toHaveBeenLastCalledWith(CARDS, 'sortField', true, TIMING);
    rerender({ ...PROPS, view: { ...VIEW, mode: 'notes' } });
    expect(calls()).toEqual([1, 1, 3]);
    expect(result.current.list).toHaveLength(1);
  });

  it('is searched and sorted again when the query changes, without building the cards again', () => {
    const { rerender } = search();
    rerender({ ...PROPS, query: 'deck:b' });
    expect(calls()).toEqual([1, 2, 2]);
  });

  it('is built, searched and sorted again with the time: the cards, the due dates and the timing follow it', () => {
    const { rerender } = search();
    rerender({ ...PROPS, now: 2, timing: { now: 1030 } as SchedTiming });
    expect(calls()).toEqual([2, 2, 2]);
    expect(steps.sort).toHaveBeenLastCalledWith(CARDS, 'sortField', false, { now: 1030 });
  });

  it('is searched and sorted again with the timing alone, as its days of the search follow it', () => {
    const { rerender } = search();
    rerender({ ...PROPS, timing: { now: 1000 } as SchedTiming });
    expect(calls()).toEqual([1, 2, 2]);
  });

  it('is built again with new data', () => {
    const { rerender } = search();
    rerender({ ...PROPS, data: { ...DATA } });
    expect(calls()).toEqual([2, 2, 2]);
  });
});

describe('a search that Anki does not accept', () => {
  it('leaves no list and says why, and the next renders do not sort again', () => {
    steps.match.mockReturnValue(new SearchError('Falta una comilla'));
    const { result, rerender } = search();
    expect(result.current.list).toEqual([]);
    expect(result.current.searchError).toBe('Falta una comilla');
    rerender({ ...PROPS });
    rerender({ ...PROPS });
    expect(steps.match).toHaveBeenCalledTimes(1);
    expect(steps.sort.mock.calls).toHaveLength(1);
  });

  it('a query that does not parse says why, with no search', () => {
    const { result } = search({ ...PROPS, query: 'deck:"a' });
    expect(result.current.searchError).not.toBeNull();
    expect(result.current.list).toEqual([]);
    expect(steps.match).not.toHaveBeenCalled();
  });
});

describe('the text', () => {
  it('follows the URL’s query, and what is typed stays until the query changes', () => {
    const { result, rerender } = search();
    expect(result.current.text).toBe('deck:a');
    act(() => {
      result.current.setText('deck:a tag:x');
    });
    rerender({ ...PROPS });
    expect(result.current.text).toBe('deck:a tag:x');
    rerender({ ...PROPS, query: 'deck:b' });
    expect(result.current.text).toBe('deck:b');
  });
});
