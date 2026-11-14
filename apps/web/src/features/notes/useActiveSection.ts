// Where the reader is in an article, for the table of contents: the section being read and how much has been read.

import { useEffect, useState } from 'react';
import type { RefObject } from 'react';

/** Just under the site's bar (5.75rem) and, below lg, the TOC's bar (8.5rem). */
const readingLine = () => (window.innerWidth < 1024 ? 150 : 120);

export interface ReadingPosition {
  active: string | null;
  progress: number;
}

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
      // At the bottom the last headings never reach the line: the last one in sight is the one being read.
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
