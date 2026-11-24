// Asks the browser for images before they show, so that the page takes them from its cache: each URL once while that
// copy is fresh, the ones about to show first, and every image kept referenced until it arrives.

/** `first`: an image about to show; `after`: one that shows later, which waits while a `first` one is on its way. */
export type WarmTurn = 'first' | 'after';

/** How long the media route lets the browser keep an image: after that it would ask the server again anyway. */
const FRESH_MS = 600_000;
const MAX_REMEMBERED = 500;

const asked = new Map<string, number>();
const inFlight = new Set<HTMLImageElement>();
const waiting = new Set<string>();
let firsts = 0;

/**
 * On the network every warm-up goes with a low priority, under the images already on screen. A `first` one starts at
 * once, also one that was waiting as `after`, and the `after` ones wait until no `first` one is on its way.
 */
export function warmImages(urls: readonly string[], turn: WarmTurn): void {
  const now = Date.now();
  forgetStale(now);
  for (const url of urls) {
    if (turn === 'first' && waiting.delete(url)) {
      start(url, turn);
      continue;
    }
    const at = asked.get(url);
    if (at !== undefined && now - at < FRESH_MS) continue;
    asked.set(url, now);
    if (turn === 'after' && firsts > 0) waiting.add(url);
    else start(url, turn);
  }
}

function start(url: string, turn: WarmTurn) {
  const image = new Image();
  image.decoding = 'async';
  image.fetchPriority = 'low';
  if (turn === 'first') firsts++;
  const settle = (failed: boolean) => {
    inFlight.delete(image);
    if (failed) asked.delete(url);
    if (turn === 'first' && --firsts === 0) {
      const next = [...waiting];
      waiting.clear();
      for (const later of next) start(later, 'after');
    }
  };
  image.onload = () => settle(false);
  image.onerror = () => settle(true);
  inFlight.add(image);
  image.src = url;
}

function forgetStale(now: number) {
  if (asked.size < MAX_REMEMBERED) return;
  for (const [url, at] of asked) if (now - at >= FRESH_MS) asked.delete(url);
}
