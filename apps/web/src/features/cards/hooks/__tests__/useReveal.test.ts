// Tests the scroll to the note the URL opens: under the bar and the lecture (never above the page), found in a row or
// in a row of cells, done once per note, and waiting for the list's width, the note and the box.
import { renderHook } from '@testing-library/react';
import type { RefObject } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Matched } from '../../model/filters';
import { BAR } from '../../model/list';
import type { ListItem } from '../../model/list';
import { useReveal } from '../useReveal';

type Props = Parameters<typeof useReveal>[0];

const matched = (guid: string) => ({ note: { note: { guid } } }) as unknown as Matched;
const ITEMS: ListItem[] = [
  { kind: 'lecture', key: 'l', lectureId: 'l1', notes: 3, top: 0, height: 48 },
  { kind: 'row', key: 'r:a', item: matched('a'), position: 0, top: 48, height: 76 },
  {
    kind: 'cells',
    key: 'c:0',
    items: [matched('b'), matched('c')],
    position: 1,
    top: 600,
    height: 150,
  },
];

let scrollTo: ReturnType<typeof vi.fn>;
const box = (top: number) =>
  ({
    current: { getBoundingClientRect: () => ({ top }) },
  }) as unknown as RefObject<HTMLElement | null>;

function reveal(patch: Partial<Props> = {}) {
  const props: Props = {
    reveal: 'c',
    items: ITEMS,
    width: 400,
    boxRef: box(100),
    lectureHeight: 48,
    ...patch,
  };
  return renderHook((p: Props) => useReveal(p), { initialProps: props });
}

beforeEach(() => {
  scrollTo = vi.fn();
  vi.stubGlobal('scrollTo', scrollTo);
});

afterEach(() => vi.unstubAllGlobals());

describe('revealing the URL’s note', () => {
  it('scrolls its row of cells under the bar and the lecture', () => {
    reveal();
    expect(scrollTo).toHaveBeenCalledWith({ top: 100 + 600 - BAR - 48 - 8 });
  });

  it('never scrolls above the page for a note near the top', () => {
    reveal({ reveal: 'a', boxRef: box(0) });
    expect(scrollTo).toHaveBeenCalledWith({ top: 0 });
  });

  it('happens once per note, though the list is built again', () => {
    const { rerender } = reveal();
    rerender({
      reveal: 'c',
      items: [...ITEMS],
      width: 500,
      boxRef: box(100),
      lectureHeight: 48,
    });
    expect(scrollTo).toHaveBeenCalledTimes(1);
    rerender({ reveal: 'a', items: ITEMS, width: 500, boxRef: box(100), lectureHeight: 48 });
    expect(scrollTo).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['no note to open', { reveal: null }],
    ['the list not measured yet', { width: 0 }],
    ['a note the list does not have', { reveal: 'z' }],
    ['the list not on the page', { boxRef: { current: null } }],
  ] as const)('waits with %s', (_what, patch) => {
    reveal(patch);
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('scrolls once the note it waited for arrives', () => {
    const { rerender } = reveal({ items: ITEMS.slice(0, 2) });
    expect(scrollTo).not.toHaveBeenCalled();
    rerender({ reveal: 'c', items: ITEMS, width: 400, boxRef: box(100), lectureHeight: 48 });
    expect(scrollTo).toHaveBeenCalledTimes(1);
  });
});
