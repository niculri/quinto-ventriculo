// Where the cards page's list is on the screen: its width, and the part of it in view, measured again on scroll and
// resize (a frame later).

import { useLayoutEffect, useRef, useState } from 'react';
import { useMediaQuery } from '../../../shared/hooks/useMediaQuery';

export function useListViewport() {
  const boxRef = useRef<HTMLElement>(null);
  const wide = useMediaQuery('(min-width: 640px)', true);
  const [width, setWidth] = useState(0);
  const [view, setView] = useState({ top: 0, height: 800 });

  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    let frame = 0;
    const measure = () => {
      const r = el.getBoundingClientRect();
      // (0 only where nothing is laid out, as the tests' DOM: a phone's width.)
      setWidth(Math.round(r.width) || 360);
      setView({ top: -r.top, height: window.innerHeight });
    };
    const later = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(later);
    observer?.observe(el);
    window.addEventListener('scroll', later, { passive: true });
    window.addEventListener('resize', later);
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener('scroll', later);
      window.removeEventListener('resize', later);
    };
  }, []);
  return { boxRef, wide, width, view };
}
