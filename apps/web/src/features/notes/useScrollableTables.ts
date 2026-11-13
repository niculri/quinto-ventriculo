import { useEffect } from 'react';
import type { RefObject } from 'react';

/**
 * A table wider than the column scrolls sideways: it has to be reachable with the keyboard (Tab, then the arrows) and
 * say what it is. Narrow tables stay out of the Tab order.
 */
export function useScrollableTables(body: RefObject<HTMLElement | null>, html: string) {
  useEffect(() => {
    const root = body.current;
    if (!root) return;
    const tables = [...root.querySelectorAll<HTMLTableElement>('table')];
    if (!tables.length) return;
    const mark = () =>
      tables.forEach((table, i) => {
        const scrolls = table.scrollWidth > table.clientWidth + 1;
        if (scrolls) {
          table.tabIndex = 0;
          if (!table.querySelector('caption')) table.setAttribute('aria-label', `Tabla ${i + 1}`);
        } else {
          table.removeAttribute('tabindex');
          table.removeAttribute('aria-label');
        }
      });
    mark();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(mark);
    tables.forEach((t) => observer?.observe(t));
    return () => observer?.disconnect();
  }, [body, html]);
}
