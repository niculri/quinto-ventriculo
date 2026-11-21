// The keyboard of the cards page's list: the arrows, the pages, Home and End move the focus from note to note (in a
// grid of photos, also across), scrolling the row into view first.

import { useEffect, useMemo, useState } from 'react';
import type { KeyboardEvent, RefObject } from 'react';
import type { Matched } from '../model/filters';
import { BAR } from '../model/list';
import type { ListItem, ListMetrics } from '../model/list';

export function useListKeys({
  items,
  metrics,
  boxRef,
  view,
}: {
  items: ListItem[];
  metrics: ListMetrics;
  boxRef: RefObject<HTMLElement | null>;
  view: { top: number; height: number };
}) {
  const [focusAt, setFocusAt] = useState<number | null>(null);
  const positions = useMemo(() => {
    const out: { item: ListItem; m: Matched }[] = [];
    for (const it of items) {
      if (it.kind === 'row') out.push({ item: it, m: it.item });
      else if (it.kind === 'cells') for (const m of it.items) out.push({ item: it, m });
    }
    return out;
  }, [items]);
  // After the scroll draws its row (it may take a frame), the focus goes to it.
  useEffect(() => {
    if (focusAt === null) return;
    const el = boxRef.current?.querySelector<HTMLElement>(`[data-position="${focusAt}"]`);
    if (el) {
      el.focus({ preventScroll: true });
      setFocusAt(null);
    }
  }, [focusAt, view, boxRef]);
  const go = (from: number, to: number) => {
    const target = Math.max(0, Math.min(positions.length - 1, to));
    if (target === from || !positions[target] || !boxRef.current) return;
    const it = positions[target].item;
    const listTop = boxRef.current.getBoundingClientRect().top + window.scrollY;
    const y = listTop + it.top;
    const viewTop = window.scrollY + BAR + metrics.lecture;
    const viewBottom = window.scrollY + window.innerHeight;
    if (y < viewTop) window.scrollTo({ top: y - BAR - metrics.lecture });
    else if (y + it.height > viewBottom)
      window.scrollTo({ top: y + it.height - window.innerHeight });
    setFocusAt(target);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    const at = Number((e.target as HTMLElement).dataset.position ?? NaN);
    if (Number.isNaN(at)) return;
    const step: Record<string, number> = {
      ArrowDown: 1,
      ArrowUp: -1,
      PageDown: 8,
      PageUp: -8,
      ArrowRight: 1,
      ArrowLeft: -1,
    };
    if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      go(at, e.key === 'Home' ? 0 : positions.length - 1);
    } else if (e.key in step) {
      const it = positions[at]?.item;
      if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && it?.kind !== 'cells') return;
      e.preventDefault();
      const columns = it?.kind === 'cells' ? metrics.columns : 1;
      const by =
        e.key === 'ArrowDown' || e.key === 'ArrowUp' ? step[e.key]! * columns : step[e.key]!;
      go(at, at + by);
    }
  };
  return onKeyDown;
}
