// Keeps the link of the page open in sight inside the menu's own scroll, scrolling only the menu and only if it is not.
import { useEffect, useRef } from 'react';

/** How far the menu has to scroll for the row to be in it: negative goes up, 0 when it already is. */
export function scrollToShow(row: DOMRect, box: DOMRect): number {
  if (row.top < box.top) return row.top - box.top;
  return row.bottom > box.bottom ? row.bottom - box.bottom : 0;
}

/** The ref goes on the menu, whose parent is what scrolls: the column on the left or the phone's drawer. */
export function useActiveInSight(page: string, ready: boolean) {
  const navRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const nav = navRef.current;
    const box = nav?.parentElement;
    const row = nav?.querySelector('[aria-current="page"]');
    if (!ready || !box || !row) return;
    box.scrollTop += scrollToShow(row.getBoundingClientRect(), box.getBoundingClientRect());
  }, [page, ready]);
  return navRef;
}
