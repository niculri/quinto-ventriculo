// Keeps the reading place of an article in the tab while one reads, and brings it back once the article is drawn after
// a reload or «Atrás»/«Adelante» (the router's own comes while the page is still short, and is lost).
import { useEffect } from 'react';
import type { RefObject } from 'react';
import { NavigationType, useLocation, useNavigationType } from 'react-router';
import { readingPlace, saveReadingPlace } from '../api/readingPlace';
import { placeAt, restores, scrollToPlace } from '../model/readingPlace';
import type { ReadingPlace } from '../model/readingPlace';

/** What comes below the article (its tests, its neighbors) can still make the page longer for this long. */
const RETRY_MS = 1500;
const READER_INPUT = ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const;

const boxes = (body: HTMLElement) =>
  [...body.children].map((b) => {
    const r = b.getBoundingClientRect();
    return { top: r.top, height: r.height };
  });

/**
 * Scrolls to the place, and again on each frame for a while: what comes late (below or above the article) can still
 * make the page too short to get there or move it. The reader's own scrolling stops it. Returns how to stop it.
 */
function bringBack(body: HTMLElement, place: ReadingPlace, done: () => void): () => void {
  const until = performance.now() + RETRY_MS;
  let frame = 0;
  const stop = () => {
    cancelAnimationFrame(frame);
    for (const e of READER_INPUT) window.removeEventListener(e, stop);
    done();
  };
  const step = () => {
    const by = scrollToPlace(boxes(body), place) ?? 0;
    if (Math.abs(by) >= 1) window.scrollBy(0, by);
    if (performance.now() > until) stop();
    else frame = requestAnimationFrame(step);
  };
  for (const e of READER_INPUT) window.addEventListener(e, stop, { passive: true });
  step();
  return stop;
}

export function useReadingPlace(bodyRef: RefObject<HTMLElement | null>) {
  const { key, pathname, hash } = useLocation();
  const pop = useNavigationType() === NavigationType.Pop;
  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    const saved = readingPlace(key);
    let restoring = restores(saved, { path: pathname, hash, pop });
    const stopRestoring = restoring
      ? bringBack(body, saved!, () => {
          restoring = false;
        })
      : null;
    let frame = 0;
    const save = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (restoring || !body.isConnected) return;
        const place = placeAt(boxes(body));
        saveReadingPlace(key, place && { ...place, path: pathname });
      });
    };
    window.addEventListener('scroll', save, { passive: true });
    return () => {
      stopRestoring?.();
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', save);
    };
  }, [bodyRef, key, pathname, hash, pop]);
}
