// Scrolls the cards page's list once to the note the URL opens, under the site's bar and its lecture.

import { useLayoutEffect, useRef } from 'react';
import type { RefObject } from 'react';
import { BAR } from '../model/list';
import type { ListItem } from '../model/list';

export function useReveal({
  reveal,
  items,
  width,
  boxRef,
  lectureHeight,
}: {
  reveal: string | null;
  items: ListItem[];
  width: number;
  boxRef: RefObject<HTMLElement | null>;
  lectureHeight: number;
}) {
  const revealedRef = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (!reveal || !width || revealedRef.current === reveal) return;
    const it = items.find(
      (i) =>
        (i.kind === 'row' && i.item.note.note.guid === reveal) ||
        (i.kind === 'cells' && i.items.some((m) => m.note.note.guid === reveal)),
    );
    if (!it || !boxRef.current) return;
    revealedRef.current = reveal;
    const listTop = boxRef.current.getBoundingClientRect().top + window.scrollY;
    window.scrollTo({ top: Math.max(0, listTop + it.top - BAR - lectureHeight - 8) });
  }, [reveal, items, width, lectureHeight, boxRef]);
}
