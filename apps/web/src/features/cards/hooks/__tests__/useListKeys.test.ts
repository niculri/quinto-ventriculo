// Tests the list's keyboard: each key's step (a row of photos at a time in a grid, across only there), the ends, the
// scroll that brings the note under the bar or above the bottom first, and the focus that waits for its row to be drawn.
import { act, renderHook } from '@testing-library/react';
import type { KeyboardEvent, RefObject } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Matched } from '../../model/filters';
import { BAR } from '../../model/list';
import type { ListItem, ListMetrics } from '../../model/list';
import { useListKeys } from '../useListKeys';

const m = (guid: string) => ({ note: { note: { guid } } }) as unknown as Matched;
const ITEMS: ListItem[] = [
  { kind: 'lecture', key: 'l', lectureId: 'l1', notes: 6, top: 0, height: 48 },
  { kind: 'topic', key: 't', lectureId: 'l1', title: 'T', notes: 2, top: 48, height: 36 },
  { kind: 'row', key: 'r:a', item: m('a'), position: 0, top: 84, height: 76 },
  { kind: 'row', key: 'r:b', item: m('b'), position: 1, top: 160, height: 76 },
  { kind: 'cells', key: 'c', items: [m('c'), m('d'), m('e')], position: 2, top: 236, height: 150 },
  { kind: 'row', key: 'r:f', item: m('f'), position: 5, top: 2000, height: 76 },
];
const METRICS: ListMetrics = { lecture: 48, topic: 36, row: 76, columns: 3, cell: 150 };
const VIEW = { top: 0, height: 768 };

let box: HTMLElement;
let scrollTo: ReturnType<typeof vi.fn>;

type Props = Parameters<typeof useListKeys>[0];

function draw(positions: number[]) {
  box.replaceChildren(
    ...positions.map((p) => {
      const b = document.createElement('button');
      b.dataset.position = String(p);
      return b;
    }),
  );
}

function keys(patch: Partial<Props> = {}) {
  const ref: RefObject<HTMLElement | null> = { current: box };
  const props: Props = { items: ITEMS, metrics: METRICS, boxRef: ref, view: VIEW, ...patch };
  const hook = renderHook((p: Props) => useListKeys(p), { initialProps: props });
  const press = (key: string, at: number | null) => {
    const target = document.createElement('div');
    if (at !== null) target.dataset.position = String(at);
    const e = { key, target, preventDefault: vi.fn() } as unknown as KeyboardEvent<HTMLElement>;
    act(() => hook.result.current(e));
    return e.preventDefault as ReturnType<typeof vi.fn>;
  };
  return { ...hook, press, props };
}

const focused = () => Number(document.activeElement?.getAttribute('data-position') ?? NaN);

beforeEach(() => {
  box = document.createElement('section');
  document.body.append(box);
  draw([0, 1, 2, 3, 4, 5]);
  vi.spyOn(box, 'getBoundingClientRect').mockReturnValue({ top: 0 } as DOMRect);
  scrollTo = vi.fn();
  vi.stubGlobal('scrollTo', scrollTo);
});

afterEach(() => {
  box.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('a key in the list', () => {
  it.each([
    ['ArrowDown', 0, 1],
    ['ArrowUp', 1, 0],
    ['PageDown', 0, 5],
    ['PageUp', 4, 0],
    ['End', 1, 5],
    ['Home', 4, 0],
    ['ArrowRight', 2, 3],
    ['ArrowLeft', 4, 3],
    ['ArrowDown', 2, 5],
    ['ArrowUp', 4, 1],
  ])('%s from note %i goes to note %i', (key, from, to) => {
    const { press } = keys();
    const prevent = press(key, from);
    expect(prevent).toHaveBeenCalled();
    expect(focused()).toBe(to);
  });

  it('across moves nothing outside a grid of photos, and lets the page have the key', () => {
    const { press } = keys();
    const prevent = press('ArrowRight', 1);
    expect(prevent).not.toHaveBeenCalled();
    expect(scrollTo).not.toHaveBeenCalled();
    expect(press('ArrowLeft', 9)).not.toHaveBeenCalled();
  });

  it('does nothing outside a note, for another key, or at the end it goes to', () => {
    const { press } = keys();
    document.body.focus();
    expect(press('ArrowDown', null)).not.toHaveBeenCalled();
    expect(press('a', 1)).not.toHaveBeenCalled();
    expect(press('Home', 0)).toHaveBeenCalled();
    expect(press('ArrowUp', 0)).toHaveBeenCalled();
    expect(Number.isNaN(focused())).toBe(true);
  });

  it('a page is eight notes', () => {
    const rows: ListItem[] = Array.from({ length: 12 }, (_, i) => ({
      kind: 'row',
      key: `r:${i}`,
      item: m(String(i)),
      position: i,
      top: i * 76,
      height: 76,
    }));
    draw(rows.map((_, i) => i));
    const { press } = keys({ items: rows });
    press('PageDown', 1);
    expect(focused()).toBe(9);
    press('PageUp', 11);
    expect(focused()).toBe(3);
  });

  it('from a note the list no longer has goes by single steps', () => {
    const { press } = keys();
    press('ArrowDown', 9);
    expect(focused()).toBe(5);
  });

  it('does nothing with an empty list or no list on the page', () => {
    keys({ items: [] }).press('ArrowDown', 0);
    keys({ boxRef: { current: null } }).press('ArrowDown', 0);
    expect(scrollTo).not.toHaveBeenCalled();
    expect(Number.isNaN(focused())).toBe(true);
  });
});

describe('the scroll before the focus', () => {
  it('brings a note hidden under the bar and the lecture down to them', () => {
    keys().press('ArrowUp', 1);
    expect(scrollTo).toHaveBeenCalledWith({ top: 84 - BAR - METRICS.lecture });
  });

  it('brings a note below the window up to its bottom', () => {
    keys().press('End', 0);
    expect(scrollTo).toHaveBeenCalledWith({ top: 2000 + 76 - window.innerHeight });
  });

  it('leaves a note already in view where it is', () => {
    keys().press('ArrowDown', 0);
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('waits for the row to be drawn, and focuses it once the view changes', () => {
    draw([0, 1]);
    const { press, rerender, props } = keys();
    press('End', 0);
    expect(Number.isNaN(focused())).toBe(true);
    draw([4, 5]);
    rerender({ ...props, view: { top: 1300, height: 768 } });
    expect(focused()).toBe(5);
  });

  it('focuses once: a later change of the view leaves the focus where the student put it', () => {
    const { press, rerender, props } = keys();
    press('ArrowDown', 0);
    expect(focused()).toBe(1);
    const other = box.querySelector<HTMLElement>('[data-position="4"]')!;
    other.focus();
    rerender({ ...props, view: { top: 50, height: 768 } });
    expect(focused()).toBe(4);
  });

  it('gives up the wait quietly if the list leaves the page', () => {
    draw([0]);
    const ref: RefObject<HTMLElement | null> = { current: box };
    const { press, rerender, props } = keys({ boxRef: ref });
    press('End', 0);
    ref.current = null;
    rerender({ ...props, view: { top: 1, height: 768 } });
    expect(Number.isNaN(focused())).toBe(true);
  });
});
