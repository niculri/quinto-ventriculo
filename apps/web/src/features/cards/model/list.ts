// The cards page's virtual list without React: its heights, its items in order, and which one is at a height.

import type { Lecture, Matched } from './explorer';

/** The site's bar over the list: the lecture and topic on top stay under it. */
export const BAR = 64;

export interface ListMetrics {
  lecture: number;
  topic: number;
  row: number;
  columns: number;
  cell: number;
}

export function listMetrics(width: number, wide: boolean): ListMetrics {
  const columns = Math.max(2, Math.floor(width / (wide ? 168 : 150)));
  const cellWidth = width / columns;
  return {
    lecture: 48,
    topic: 36,
    row: wide ? 76 : 100,
    columns,
    cell: Math.round(cellWidth * 0.75) + 36,
  };
}

export type ListItem =
  | { kind: 'lecture'; key: string; lectureId: string; notes: number; top: number; height: number }
  | {
      kind: 'topic';
      key: string;
      lectureId: string;
      title: string;
      notes: number;
      top: number;
      height: number;
    }
  | { kind: 'row'; key: string; item: Matched; position: number; top: number; height: number }
  | { kind: 'cells'; key: string; items: Matched[]; position: number; top: number; height: number };

/** Every height is known before anything is drawn, so nothing moves when rows come into view. */
export function listItems(lectures: readonly Lecture[], m: ListMetrics) {
  const items: ListItem[] = [];
  let top = 0;
  let position = 0;
  const push = (item: ListItem) => {
    items.push(item);
    top += item.height;
  };
  for (const l of lectures) {
    push({
      kind: 'lecture',
      key: `l:${l.id}`,
      lectureId: l.id,
      notes: l.notes,
      top,
      height: m.lecture,
    });
    for (const g of l.groups) {
      if (g.title !== null) {
        push({
          kind: 'topic',
          key: `t:${g.key}`,
          lectureId: l.id,
          title: g.title,
          notes: g.items.length,
          top,
          height: m.topic,
        });
      }
      if (g.grid) {
        for (let i = 0; i < g.items.length; i += m.columns) {
          const chunk = g.items.slice(i, i + m.columns);
          push({
            kind: 'cells',
            key: `c:${g.key}:${i}`,
            items: chunk,
            position,
            top,
            height: m.cell,
          });
          position += chunk.length;
        }
      } else {
        for (const item of g.items) {
          push({
            kind: 'row',
            key: `r:${item.note.note.guid}`,
            item,
            position,
            top,
            height: m.row,
          });
          position++;
        }
      }
    }
  }
  return { items, total: top };
}

export function itemAt(items: readonly ListItem[], y: number): number {
  let lo = 0;
  let hi = items.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    const it = items[mid]!;
    if (it.top + it.height <= y) lo = mid + 1;
    else hi = mid;
  }
  return Math.max(0, lo);
}

export function headingAt(
  items: readonly ListItem[],
  y: number,
): { lectureId: string; topic: string | null } | null {
  if (!items.length) return null;
  let lectureId: string | null = null;
  let topic: string | null = null;
  for (let i = itemAt(items, y); i >= 0; i--) {
    const it = items[i]!;
    if (it.kind === 'topic' && topic === null && lectureId === null) topic = it.title;
    if (it.kind === 'lecture') {
      lectureId = it.lectureId;
      break;
    }
  }
  return lectureId === null ? null : { lectureId, topic };
}
