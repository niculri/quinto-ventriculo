// Which images of a card are asked for before they show: while its front is up, those of its back; for the next cards
// of the queue, those of both sides, unless the browser saves data.
import { apiPaths } from '@qv/schema/http';

export interface CardSides {
  front: string;
  back: string;
}

const MEDIA = apiPaths.media('');
const SRC = /\ssrc="([^"]+)"/g;

/** The signed images of a side, as the browser will ask for them: the HTML escapes the `&` of the query. */
export function mediaUrlsIn(html: string): string[] {
  const urls = new Set<string>();
  for (const [, src] of html.matchAll(SRC)) {
    const url = src!.replaceAll('&amp;', '&');
    if (url.startsWith(MEDIA)) urls.add(url);
  }
  return [...urls];
}

/** The back's images that the front on screen is not already loading. */
export function backImagesOf(card: CardSides): string[] {
  const front = new Set(mediaUrlsIn(card.front));
  return mediaUrlsIn(card.back).filter((url) => !front.has(url));
}

export function upcomingImagesOf(card: CardSides, saveData: boolean): string[] {
  if (saveData) return [];
  return [...new Set([...mediaUrlsIn(card.front), ...mediaUrlsIn(card.back)])];
}
