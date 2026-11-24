// Waits for the fonts of articles and tests (Inter, the titles' serif and, in an article, QV Sans), so that nothing is
// drawn with another font and then changes; after a few seconds the page is drawn anyway.
import { useEffect, useState } from 'react';

const FACES = {
  test: [
    '400 1em "Inter Variable"',
    'italic 400 1em "Inter Variable"',
    '600 1em "Source Serif 4 Variable"',
  ],
  article: [
    '400 1em "Inter Variable"',
    'italic 400 1em "Inter Variable"',
    '600 1em "Source Serif 4 Variable"',
    '400 1em "QV Sans"',
    'italic 400 1em "QV Sans"',
  ],
} as const;
type Reading = keyof typeof FACES;
const FONT_WAIT_MS = 3000;

const ready = new Map<Reading, Promise<void>>();
const done = new Set<Reading>();

function readingFontsReady(reading: Reading): Promise<void> {
  let wait = ready.get(reading);
  if (!wait) {
    // jsdom has no `document.fonts`, and some old browsers neither.
    const fonts = 'fonts' in document ? document.fonts : undefined;
    const loading = fonts
      ? Promise.all(FACES[reading].map((f) => fonts.load(f)))
      : Promise.resolve();
    const timeout = new Promise<void>((resolve) => setTimeout(resolve, FONT_WAIT_MS));
    wait = Promise.race([
      loading.then(
        () => undefined,
        () => undefined,
      ),
      timeout,
    ]).then(() => {
      done.add(reading);
    });
    ready.set(reading, wait);
  }
  return wait;
}

/** `article`: an article's page, whose text is QV Sans; `test`: a test's. */
export function useReadingFonts(reading: Reading = 'test'): boolean {
  const [loaded, setLoaded] = useState(done.has(reading));
  useEffect(() => {
    if (loaded) return;
    let alive = true;
    void readingFontsReady(reading).then(() => {
      if (alive) setLoaded(true);
    });
    return () => {
      alive = false;
    };
  }, [loaded, reading]);
  return loaded;
}
