import { useEffect, useState } from 'react';

/**
 * The faces an article or a test draws with: Inter's text, bold and italic (one file each style), and the title's
 * serif. They wait for them, so that nothing is drawn with another font and then changes.
 */
const FACES = [
  '400 1em "Inter Variable"',
  'italic 400 1em "Inter Variable"',
  '600 1em "Source Serif 4 Variable"',
];
/** If a font fails or is slow, the page is drawn anyway after this long. */
const FONT_WAIT_MS = 3000;

let ready: Promise<void> | null = null;
let done = false;

/** Resolves when the fonts are in (or after the wait). */
function readingFontsReady(): Promise<void> {
  if (!ready) {
    const fonts = typeof document === 'undefined' ? undefined : document.fonts;
    const loading = fonts ? Promise.all(FACES.map((f) => fonts.load(f))) : Promise.resolve();
    const wait = new Promise<void>((resolve) => setTimeout(resolve, FONT_WAIT_MS));
    ready = Promise.race([
      loading.then(
        () => undefined,
        () => undefined,
      ),
      wait,
    ]).then(() => {
      done = true;
    });
  }
  return ready;
}

/** Whether the fonts are in; true at once after the first article or test. */
export function useReadingFonts(): boolean {
  const [loaded, setLoaded] = useState(done);
  useEffect(() => {
    if (loaded) return;
    let alive = true;
    void readingFontsReady().then(() => {
      if (alive) setLoaded(true);
    });
    return () => {
      alive = false;
    };
  }, [loaded]);
  return loaded;
}
