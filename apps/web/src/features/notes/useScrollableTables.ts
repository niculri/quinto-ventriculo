import { useEffect } from 'react';
import type { RefObject } from 'react';

/**
 * A table wider than the column scrolls sideways in its wrapper (`.table-scroll`): the wrapper has to be reachable with
 * the keyboard (Tab, then the arrows) and say what it is. Narrow tables stay out of the Tab order.
 */
export function useScrollableTables(body: RefObject<HTMLElement | null>, html: string) {
  useEffect(() => {
    const root = body.current;
    if (!root) return;
    const wrappers = [...root.querySelectorAll<HTMLElement>('.table-scroll')];
    if (!wrappers.length) return;
    const mark = () =>
      wrappers.forEach((wrapper, i) => {
        const scrolls = wrapper.scrollWidth > wrapper.clientWidth + 1;
        if (scrolls) {
          wrapper.tabIndex = 0;
          wrapper.setAttribute('role', 'region');
          if (!wrapper.querySelector('caption'))
            wrapper.setAttribute('aria-label', `Tabla ${i + 1}`);
        } else {
          wrapper.removeAttribute('tabindex');
          wrapper.removeAttribute('role');
          wrapper.removeAttribute('aria-label');
        }
      });
    mark();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(mark);
    wrappers.forEach((w) => observer?.observe(w));
    return () => observer?.disconnect();
  }, [body, html]);
}
