// Asks the browser for images before they show, so that the page takes them from its cache: each URL once while that
// copy is fresh, the urgent ones first, and every image kept referenced until it arrives.

export type WarmPriority = 'high' | 'low';

/** How long the media route lets the browser keep an image: after that it would ask the server again anyway. */
const FRESH_MS = 600_000;
const MAX_REMEMBERED = 500;

const asked = new Map<string, number>();
const inFlight = new Set<HTMLImageElement>();
const waiting: string[] = [];
let urgent = 0;

/** A low one waits while an urgent one is on its way: the next cards never hold up the one on screen. */
export function warmImages(urls: readonly string[], priority: WarmPriority): void {
  const now = Date.now();
  forgetStale(now);
  for (const url of urls) {
    const at = asked.get(url);
    if (at !== undefined && now - at < FRESH_MS) continue;
    asked.set(url, now);
    if (priority === 'low' && urgent > 0) waiting.push(url);
    else start(url, priority);
  }
}

function start(url: string, priority: WarmPriority) {
  const image = new Image();
  image.decoding = 'async';
  image.fetchPriority = priority;
  if (priority === 'high') urgent++;
  const settle = (failed: boolean) => {
    inFlight.delete(image);
    if (failed) asked.delete(url);
    if (priority === 'high' && --urgent === 0) {
      for (const next of waiting.splice(0)) start(next, 'low');
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
