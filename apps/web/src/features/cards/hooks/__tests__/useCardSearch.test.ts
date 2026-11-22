// Tests the table's search: the list is the cards that match the query, sorted, from the latest data, query, view and
// time, and a render that changes nothing builds nothing again.
import { act, renderHook } from '@testing-library/react';
import { SearchError, parseSearch } from '@qv/anki-search';
import type { SchedTiming } from '@qv/srs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { compiled } from '../../../../test/compiled';
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

describe('the list', () => {
  it('is the cards that match, sorted', () => {
    const { result } = search();
    expect(result.current.list.map((c) => c.key)).toEqual(['b', 'a']);
    expect(steps.match).toHaveBeenLastCalledWith(parseSearch('deck:a'), {}, CARDS);
    expect(steps.sort).toHaveBeenLastCalledWith(CARDS, 'sortField', false, TIMING);
  });

  // What the compiler gives and the coverage run, without it, does not.
  it.skipIf(!compiled)('is not built again by a render that changes nothing', () => {
    const { rerender } = search();
    rerender({ ...PROPS });
    rerender({ ...PROPS, view: { ...VIEW, columns: ['x' as never] } });
    expect(steps.build).toHaveBeenCalledTimes(1);
    expect(steps.match).toHaveBeenCalledTimes(1);
    expect(steps.sort).toHaveBeenCalledTimes(1);
  });

  it('is sorted again when the sort or the mode changes', () => {
    const { rerender, result } = search();
    rerender({ ...PROPS, view: { ...VIEW, sort: { column: 'sortField', descending: true } } });
    expect(steps.sort).toHaveBeenLastCalledWith(CARDS, 'sortField', true, TIMING);
    rerender({ ...PROPS, view: { ...VIEW, mode: 'notes' } });
    expect(result.current.list).toHaveLength(1);
  });

  it('is searched again when the query changes', () => {
    const { rerender } = search();
    rerender({ ...PROPS, query: 'deck:b' });
    expect(steps.match).toHaveBeenLastCalledWith(parseSearch('deck:b'), {}, CARDS);
  });

  it('is built, searched and sorted again with the time: the cards, the due dates and the timing follow it', () => {
    const { rerender } = search();
    rerender({ ...PROPS, now: 2, timing: { now: 1030 } as SchedTiming });
    expect(steps.build.mock.lastCall![6]).toBe(2);
    expect(steps.sort).toHaveBeenLastCalledWith(CARDS, 'sortField', false, { now: 1030 });
  });

  it('is built again with new data', () => {
    const { rerender } = search();
    rerender({ ...PROPS, data: { ...DATA, notes: [{ id: 'new' }] as never } });
    expect(steps.build.mock.lastCall![0]).toEqual([{ id: 'new' }]);
  });
});

describe('a search that Anki does not accept', () => {
  it('leaves no list and says why', () => {
    steps.match.mockReturnValue(new SearchError('Falta una comilla'));
    const { result, rerender } = search();
    expect(result.current.list).toEqual([]);
    expect(result.current.searchError).toBe('Falta una comilla');
    rerender({ ...PROPS });
    expect(result.current.searchError).toBe('Falta una comilla');
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
