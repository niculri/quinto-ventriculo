// Tests the table's selection as in Anki: a click, Ctrl/⌘ (from the current card) and Mayús (either way), the current
// card read from and written to the URL, and «Notas» choosing every card of a note.
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { browseCard } from '../../../../test/cardsFakes';
import type { BrowseCard, BrowseNoteRow } from '../../model/browseCards';
import { cardKey } from '@qv/study';
import { useSelection } from '../useSelection';
import type { SelectKeys } from '../useSelection';

const k = (noteGuid: string, ord: number) => cardKey({ noteGuid, ord });
const card = (guid: string, ord = 0) => browseCard({ key: k(guid, ord), ord, note: { guid } });
const LIST = [card('a'), card('b'), card('c'), card('d')];
const PLAIN: SelectKeys = { shiftKey: false, ctrlKey: false, metaKey: false };

type Props = Parameters<typeof useSelection>[0];

function selection(url = '', list: BrowseCard[] = LIST, mode: Props['mode'] = 'cards') {
  const setParams = vi.fn();
  const props: Props = { list, mode, params: new URLSearchParams(url), setParams };
  const hook = renderHook((p: Props) => useSelection(p), { initialProps: props });
  return { ...hook, setParams };
}

const keys = (s: Set<string>) => [...s];

describe('the current card', () => {
  it('is the URL’s note and card (ord 0 when the URL has none)', () => {
    const { result } = selection('note=b');
    expect(result.current.urlCard).toBe(k('b', 0));
    expect(result.current.current?.key).toBe(k('b', 0));
    expect(keys(result.current.effectiveSelection)).toEqual([k('b', 0)]);
    expect(result.current.focus?.key).toBe(k('b', 0));
  });

  it('is none without a note in the URL, or with one the list does not have', () => {
    expect(selection().result.current.urlCard).toBeNull();
    const missing = selection('note=z&ord=1').result.current;
    expect(missing.urlCard).toBe(k('z', 1));
    expect(missing.current).toBeNull();
    expect(missing.focus).toBeNull();
    expect(missing.effectiveSelection.size).toBe(0);
  });

  it('in «Notas» is the row of its note', () => {
    const row = { ...card('b'), key: 'note:b', cards: [card('b', 0), card('b', 1)] };
    const { result } = selection('note=b&ord=1', [row], 'notes');
    expect(result.current.current?.key).toBe('note:b');
    expect(result.current.chosen().map((c) => c.key)).toEqual([k('b', 0), k('b', 1)]);
    expect((result.current.current as BrowseNoteRow).cards).toHaveLength(2);
  });

  it('goes to the URL with the other parameters kept, replacing the entry', () => {
    const { result, setParams } = selection('q=x');
    act(() => result.current.select(LIST[2]!, PLAIN));
    const [next, how] = setParams.mock.calls[0] as [URLSearchParams, unknown];
    expect(next.toString()).toBe('q=x&note=c&ord=0');
    expect(how).toEqual({ replace: true });
  });
});

describe('a click', () => {
  it('chooses only that row', () => {
    const { result } = selection('note=a');
    act(() => result.current.select(LIST[1]!, PLAIN));
    expect(keys(result.current.effectiveSelection)).toEqual([k('b', 0)]);
  });

  it('with Ctrl adds to the current card, and again takes it away', () => {
    const { result } = selection('note=a');
    act(() => result.current.select(LIST[2]!, { ...PLAIN, ctrlKey: true }));
    expect(keys(result.current.effectiveSelection)).toEqual([k('a', 0), k('c', 0)]);
    act(() => result.current.select(LIST[2]!, { ...PLAIN, metaKey: true }));
    expect(keys(result.current.effectiveSelection)).toEqual([k('a', 0)]);
  });

  it('with Mayús chooses the range from the last click, either way', () => {
    const { result } = selection();
    act(() => result.current.select(LIST[3]!, PLAIN));
    act(() => result.current.select(LIST[1]!, { ...PLAIN, shiftKey: true }));
    expect(keys(result.current.effectiveSelection)).toEqual([k('b', 0), k('c', 0), k('d', 0)]);
    act(() => result.current.select(LIST[3]!, PLAIN));
    act(() => result.current.select(LIST[3]!, { ...PLAIN, ctrlKey: true }));
    act(() => result.current.select(LIST[0]!, { ...PLAIN, ctrlKey: true }));
    act(() => result.current.select(LIST[2]!, { ...PLAIN, shiftKey: true }));
    expect(keys(result.current.effectiveSelection)).toEqual([k('a', 0), k('b', 0), k('c', 0)]);
  });

  it('with Mayús and no earlier click chooses only that row', () => {
    const { result } = selection();
    act(() => result.current.select(LIST[2]!, { ...PLAIN, shiftKey: true }));
    expect(keys(result.current.effectiveSelection)).toEqual([k('c', 0)]);
  });
});

describe('the whole selection', () => {
  it('can take every row and be emptied back to the current card', () => {
    const { result } = selection('note=d');
    act(() => result.current.selectAll());
    expect(result.current.chosen()).toHaveLength(4);
    act(() => result.current.clear());
    expect(keys(result.current.effectiveSelection)).toEqual([k('d', 0)]);
  });

  it('focuses its first row when the current card is not in it', () => {
    const { result } = selection('note=z');
    act(() => result.current.select(LIST[1]!, { ...PLAIN, ctrlKey: true }));
    act(() => result.current.select(LIST[3]!, { ...PLAIN, ctrlKey: true }));
    expect(result.current.focus?.key).toBe(k('b', 0));
  });
});
