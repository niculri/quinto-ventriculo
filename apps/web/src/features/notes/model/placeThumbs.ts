// Moves an article's thumbnails, before the first paint, to where there is enough text beside them.

import { COLUMN_PX } from './figures';

const CLEARS = 'h2, hr, .table-scroll, .figure-row, figure.is-wide, .note-summary';
const HEADING = 'h2, h3, h4, .note-summary';
const START = 'p:not(.source), ul, ol, .callout';

// Inter at 17px (text) and 12.8px (caption): its average letter is about half an em wide.
const LINE_PX = 17 * 1.7;
const LETTER_PX = 8.5;
const GAP_PX = 26;
const CAPTION_LINE_PX = 18.6;
const CAPTION_LETTER_PX = 7;
const FRAME_PX = 30;

/**
 * A thumbnail whose text runs out before a float-clearing block would leave an empty strip: it moves to the nearest
 * place of its section with enough text (down first, never past a heading), or else where the strip is smallest.
 */
export function placeThumbs(root: DocumentFragment, textPx: number) {
  const thumbs = flow(root).filter((e) => e.matches('figure.is-thumb'));
  for (const figure of thumbs) {
    const blocks = flow(root).filter((e) => e !== figure);
    const at = flow(root).indexOf(figure);
    const size = measure(figure as HTMLElement, textPx);
    if (!missingFrom(blocks, at, size, textPx)) continue;
    const best = bestPlace(blocks, at, size, textPx);
    if (best !== at) blocks[best]!.before(figure);
  }
}

/** Where in its section the thumbnail at `at` misses the least text: the nearest place without any missing. */
function bestPlace(blocks: Element[], at: number, size: Size, textPx: number): number {
  let start = at;
  while (start > 0 && !blocks[start - 1]!.matches(HEADING)) start--;
  let end = at;
  while (end < blocks.length && !blocks[end]!.matches(HEADING)) end++;
  const places = [];
  for (let k = start; k <= end; k++) {
    if (k !== at && !blocks[k]?.matches(START)) continue;
    const far = Math.abs(k - at) * 2 + (k < at ? 1 : 0);
    places.push({ k, missing: missingFrom(blocks, k, size, textPx), far });
  }
  places.sort((a, b) => a.far - b.far);
  const best =
    places.find((p) => !p.missing) ?? places.reduce((a, b) => (b.missing < a.missing ? b : a));
  return best.k;
}

function flow(root: DocumentFragment): Element[] {
  return [...root.children].flatMap((e) => (e.matches('.side') ? [...e.children] : [e]));
}

interface Size {
  tall: number;
  perLine: number;
}

/** Its height and how many letters fit in a line beside it: the column's rest, but never more than the measure. */
function measure(figure: HTMLElement, textPx: number): Size {
  const width = parseFloat(figure.style.getPropertyValue('--fig')) * 16;
  const img = figure.querySelector('img');
  const ratio = Number(img?.getAttribute('width')) / Number(img?.getAttribute('height')) || 4 / 3;
  const caption = figure.querySelector('figcaption')?.textContent.length ?? 0;
  return {
    tall:
      width / ratio + Math.ceil(caption / (width / CAPTION_LETTER_PX)) * CAPTION_LINE_PX + FRAME_PX,
    perLine: Math.min(textPx, COLUMN_PX - width - GAP_PX) / LETTER_PX,
  };
}

/** Text (px) missing beside a thumbnail placed before `blocks[start]`, counting the thumbnails that stack with it. */
function missingFrom(blocks: Element[], start: number, size: Size, textPx: number) {
  let need = size.tall;
  for (let i = start - 1; i >= 0 && blocks[i]!.matches('figure.is-thumb'); i--) {
    need += measure(blocks[i] as HTMLElement, textPx).tall;
  }
  let height = 0;
  for (let i = start; i < blocks.length && height < need; i++) {
    const el = blocks[i]!;
    if (el.matches(CLEARS)) break;
    if (el.matches('figure.is-thumb')) need += measure(el as HTMLElement, textPx).tall;
    else height += textHeight(el, size.perLine);
  }
  return Math.max(0, need - height);
}

function textHeight(el: Element, perLine: number): number {
  const parts = el.matches('ul, ol') ? [...el.children] : [el];
  const lines = parts.reduce(
    (sum, part) => sum + Math.max(1, Math.ceil(part.textContent.length / perLine)),
    0,
  );
  return lines * LINE_PX + 17;
}
