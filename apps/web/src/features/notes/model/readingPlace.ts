// Where in an article one is reading, as the block at the top of the screen and how far into it: kept that way, the
// place is found again after the article is drawn, also at another width.

export interface ReadingPlace {
  path: string;
  /** The index of the block of the article's body (a paragraph, a heading, a figure). */
  block: number;
  /** How far into that block, from 0 to 1. */
  within: number;
  /** Below the article's last block (its tests, its neighbors), how far below, in pixels. */
  past: number;
}

type Spot = Pick<ReadingPlace, 'block' | 'within' | 'past'>;

interface Box {
  top: number;
  height: number;
}

/** The line, below the site's bar, whose block is the one being read. */
export const READING_LINE = 72;

/**
 * The last block that starts above the reading line, in the order of the article (a figure beside the text can start
 * lower than the paragraph after it); null above the first.
 */
export function placeAt(blocks: readonly Box[]): Spot | null {
  const block = blocks.findLastIndex((b) => b.top <= READING_LINE);
  if (block < 0) return null;
  const { top, height } = blocks[block]!;
  const into = READING_LINE - top;
  return {
    block,
    within: height > 0 ? Math.min(1, into / height) : 0,
    past: block === blocks.length - 1 ? Math.max(0, into - height) : 0,
  };
}

/** How far the page has to scroll for the place to be back on the reading line; null if the block is not there. */
export function scrollToPlace(blocks: readonly Box[], place: Spot): number | null {
  const box = blocks[place.block];
  return box ? box.top + place.within * box.height + place.past - READING_LINE : null;
}

/**
 * Only on coming back to the same entry of the history (a reload, «Atrás», «Adelante») the place comes back; a new visit
 * is another entry, and a link to a section goes to it.
 */
export function restores(
  place: ReadingPlace | null,
  arrival: { path: string; hash: string; pop: boolean },
): place is ReadingPlace {
  return !!place && arrival.pop && !arrival.hash && place.path === arrival.path;
}
