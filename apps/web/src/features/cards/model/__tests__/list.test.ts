// Tests the cards page's virtual list: its sizes by width, every item's height and place before drawing, and which
// item and heading are at a height.
import { describe, expect, it } from 'vitest';
import type { Matched } from '../filters';
import type { Lecture } from '../groups';
import { headingAt, itemAt, listItems, listMetrics } from '../list';
import type { ListItem } from '../list';

const matched = (guid: string) => ({ note: { note: { guid } }, cards: [] }) as unknown as Matched;
const M = { lecture: 50, topic: 30, row: 100, columns: 2, cell: 80 };

const LECTURES: Lecture[] = [
  {
    id: 'L1',
    notes: 3,
    groups: [
      { key: 'g1', lectureId: 'L1', title: null, grid: false, items: [matched('a')] },
      {
        key: 'g2',
        lectureId: 'L1',
        title: 'Imágenes',
        grid: true,
        items: [matched('b'), matched('c'), matched('d')],
      },
    ],
  },
  {
    id: 'L2',
    notes: 1,
    groups: [{ key: 'g3', lectureId: 'L2', title: 'Tema', grid: false, items: [matched('e')] }],
  },
];

describe('the list’s sizes', () => {
  it.each([
    ['fits a column per 150 px', 900, false, { columns: 6, row: 100, cell: 149 }],
    ['fits a column per 168 px when wide', 900, true, { columns: 5, row: 76, cell: 171 }],
    ['never has fewer than two columns', 100, false, { columns: 2, row: 100, cell: 74 }],
  ])('%s', (_, width, wide, sizes) => {
    expect(listMetrics(width, wide)).toEqual({ lecture: 48, topic: 36, ...sizes });
  });
});

describe('the list’s items', () => {
  const { items, total } = listItems(LECTURES, M);

  it('go lecture, its topics and rows, an image group in rows of cells; each below the one before', () => {
    expect(items.map((i) => [i.kind, i.key, i.top, i.height])).toEqual([
      ['lecture', 'l:L1', 0, 50],
      ['row', 'r:a', 50, 100],
      ['topic', 't:g2', 150, 30],
      ['cells', 'c:g2:0', 180, 80],
      ['cells', 'c:g2:2', 260, 80],
      ['lecture', 'l:L2', 340, 50],
      ['topic', 't:g3', 390, 30],
      ['row', 'r:e', 420, 100],
    ]);
    expect(total).toBe(520);
  });

  it('count the notes’ places across groups and lectures, a row of cells by all its notes', () => {
    const places = items.flatMap((i) =>
      i.kind === 'row'
        ? [[i.key, i.position]]
        : i.kind === 'cells'
          ? [[i.key, i.position, i.items.length]]
          : [],
    );
    expect(places).toEqual([
      ['r:a', 0],
      ['c:g2:0', 1, 2],
      ['c:g2:2', 3, 1],
      ['r:e', 4],
    ]);
  });

  it('is nothing for no lectures', () => {
    expect(listItems([], M)).toEqual({ items: [], total: 0 });
  });
});

describe('what is at a height', () => {
  const { items } = listItems(LECTURES, M);

  it.each([
    [0, 0],
    [49, 0],
    [50, 1],
    [149, 1],
    [150, 2],
    [519, 7],
    [10_000, 7],
    [-5, 0],
  ])('at %i is item %i', (y, index) => {
    expect(itemAt(items, y)).toBe(index);
  });

  it('is item 0 of an empty list', () => {
    expect(itemAt([], 100)).toBe(0);
  });

  it('the heading is the lecture above, with the topic only when it is that lecture’s nearest one', () => {
    expect(headingAt(items, 60)).toEqual({ lectureId: 'L1', topic: null });
    expect(headingAt(items, 200)).toEqual({ lectureId: 'L1', topic: 'Imágenes' });
    expect(headingAt(items, 395)).toEqual({ lectureId: 'L2', topic: 'Tema' });
    expect(headingAt(items, 360)).toEqual({ lectureId: 'L2', topic: null });
  });

  it('there is no heading in an empty list, nor above a list that does not start with a lecture', () => {
    expect(headingAt([], 0)).toBeNull();
    const loose: ListItem[] = [
      { kind: 'topic', key: 't', lectureId: 'x', title: 'T', notes: 1, top: 0, height: 30 },
    ];
    expect(headingAt(loose, 10)).toBeNull();
  });
});
