// Which images of a card are asked for before they show: while its front is up, those of its back; for the next cards
// of the queue, those of both sides, unless the browser saves data.
import { mediaUrlsIn } from '../../../shared/lib/signedMedia';

export interface CardSides {
  front: string;
  back: string;
}

/** The back's images that the front on screen is not already loading. */
export function backImagesOf(card: CardSides): string[] {
  const front = new Set(mediaUrlsIn(card.front));
  return [...new Set(mediaUrlsIn(card.back))].filter((url) => !front.has(url));
}

export function upcomingImagesOf(card: CardSides, saveData: boolean): string[] {
  if (saveData) return [];
  return [...new Set([...mediaUrlsIn(card.front), ...mediaUrlsIn(card.back)])];
}
