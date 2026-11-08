import { useEffect, useState } from 'react';
import type { RefObject } from 'react';

/**
 * Distance from the top (px) at which a heading counts as «the section being read»: under the site's bar
 * (a heading reached from a link stops at 5.75rem) and, below lg, also under the TOC's bar (at 8.5rem).
 */
const readingLine = () => (window.innerWidth < 1024 ? 150 : 120);

export interface ReadingPosition {
  /** The section being read (the last h2/h3 that went past the reading line). */
  active: string | null;
  /** How much of the article has gone past the reading line, from 0 to 1. Nothing is saved. */
  progress: number;
}

/** Where the reader is in the article, for the TOC. Nothing is saved. */
export function useActiveSection(
  container: RefObject<HTMLElement | null>,
  ready: boolean,
): ReadingPosition {
  const [position, setPosition] = useState<ReadingPosition>({ active: null, progress: 0 });

  useEffect(() => {
    const el = container.current;
    if (!ready || !el) return;
    const headings = [...el.querySelectorAll<HTMLElement>('h2[id], h3[id]')];
    let frame = 0;
    const measure = () => {
      frame = 0;
      const READING_LINE = readingLine();
      let active: string | null = null;
      for (const h of headings) {
        if (h.getBoundingClientRect().top <= READING_LINE) active = h.id;
        else break;
      }
      // At the bottom of the page the last headings can never reach the line: the last one that is in
      // sight is the one being read («Ponte a prueba»).
      const atBottom =
        window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      if (atBottom) {
        const visible = headings.filter((h) => h.getBoundingClientRect().top < window.innerHeight);
        active = visible.at(-1)?.id ?? active;
      }
      const box = el.getBoundingClientRect();
      const span = box.height - window.innerHeight + READING_LINE;
      const progress = span > 0 ? Math.min(1, Math.max(0, (READING_LINE - box.top) / span)) : 1;
      setPosition((p) =>
        p.active === active && Math.abs(p.progress - progress) < 0.002 ? p : { active, progress },
      );
    };
    const onMove = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener('scroll', onMove, { passive: true });
    window.addEventListener('resize', onMove);
    return () => {
      window.removeEventListener('scroll', onMove);
      window.removeEventListener('resize', onMove);
      cancelAnimationFrame(frame);
    };
  }, [container, ready]);

  return position;
}
