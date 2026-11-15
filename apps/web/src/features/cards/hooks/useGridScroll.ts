// The table's scroll: its height as the window changes, the top of the view, and the current row kept in view.

import { useEffect, useRef, useState } from 'react';
import { ROW } from '../model/grid';

export function useGridScroll(currentIndex: number) {
  const scroller = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState(0);
  const [height, setHeight] = useState(600);
  useEffect(() => {
    const el = scroller.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => setHeight(el.clientHeight || 600));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const el = scroller.current;
    if (!el || currentIndex < 0) return;
    const y = currentIndex * ROW;
    if (y < el.scrollTop) el.scrollTop = y;
    else if (y + ROW > el.scrollTop + el.clientHeight - ROW) {
      el.scrollTop = y + 2 * ROW - el.clientHeight;
    }
  }, [currentIndex]);
  return { scroller, top, setTop, height };
}
