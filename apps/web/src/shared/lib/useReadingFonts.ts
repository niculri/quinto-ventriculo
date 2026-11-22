// Waits for the fonts of articles and tests (Inter and the titles' serif), so that nothing is drawn with another font
// and then changes; after a few seconds the page is drawn anyway.
import { useEffect, useState } from 'react';

const FACES = [
  '400 1em "Inter Variable"',
  'italic 400 1em "Inter Variable"',
  '600 1em "Source Serif 4 Variable"',
];
const FONT_WAIT_MS = 3000;

let ready: Promise<void> | null = null;
let done = false;

function readingFontsReady(): Promise<void> {
  if (!ready) {
    // jsdom has no `document.fonts`, and some old browsers neither.
    const fonts = 'fonts' in document ? document.fonts : undefined;
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
