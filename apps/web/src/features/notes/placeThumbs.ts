import { COLUMN_PX } from './figures';

/** What starts below every float (CSS `clear`), and the headings a thumbnail never passes. */
const CLEARS = 'h2, hr, .table-scroll, .figure-row, figure.is-wide, .note-summary';
const HEADING = 'h2, h3, h4, .note-summary';
/** What a thumbnail can be put before: the text it goes beside. */
const START = 'p:not(.source), ul, ol, .callout';

/** The text's measures at 17px (Inter's average letter is about half an em wide), and the gap beside a float. */
const LINE_PX = 17 * 1.7;
const LETTER_PX = 8.5;
const GAP_PX = 26;
/** The caption's line and average letter (12.8px), and what the frame adds around image and caption. */
const CAPTION_LINE_PX = 18.6;
const CAPTION_LETTER_PX = 7;
const FRAME_PX = 30;

/**
 * A thumbnail goes beside the text it accompanies. When the text after it is shorter than it before something that
 * starts below every float (a table, a wide figure, the next section), it would leave an empty strip at its left.
 * Then, like Wikipedia, it moves to the nearest place of its section with enough text beside it: first down (below
 * the table or figure, beside the text that follows), then up (over the paragraphs above). It never leaves its
 * section (it never passes a heading). If no place has enough text, it stays on the right where the strip is
 * smallest. Estimated in the 53rem column, before the first paint, so nothing moves afterwards.
 */
export function placeThumbs(root: DocumentFragment) {
  const thumbs = flow(root).filter((e) => e.matches('figure.is-thumb'));
  for (const figure of thumbs) {
    const blocks = flow(root).filter((e) => e !== figure);
    const at = flow(root).indexOf(figure);
    const size = measure(figure as HTMLElement);
    if (!missingFrom(blocks, at, size)) continue;

    let start = at;
    while (start > 0 && !blocks[start - 1]!.matches(HEADING)) start--;
    let end = at;
    while (end < blocks.length && !blocks[end]!.matches(HEADING)) end++;
    const places = [];
    for (let k = start; k <= end; k++) {
      if (k !== at && !blocks[k]?.matches(START)) continue;
      // Down first: the same distance below wins.
      const far = Math.abs(k - at) * 2 + (k < at ? 1 : 0);
      places.push({ k, missing: missingFrom(blocks, k, size), far });
    }
    places.sort((a, b) => a.far - b.far);
    const best =
      places.find((p) => !p.missing) ?? places.reduce((a, b) => (b.missing < a.missing ? b : a));
    if (best.k !== at) blocks[best.k]!.before(figure);
  }
}

/** The article's blocks in order, with those of a `::: der` block in its place. */
function flow(root: DocumentFragment): Element[] {
  return [...root.children].flatMap((e) => (e.matches('.side') ? [...e.children] : [e]));
}

interface Size {
  tall: number;
  perLine: number;
}

/** How tall a thumbnail is, and how many letters a line of the text beside it holds (in the 53rem column). */
function measure(figure: HTMLElement): Size {
  const width = parseFloat(figure.style.getPropertyValue('--fig')) * 16;
  const img = figure.querySelector('img');
  const ratio = Number(img?.getAttribute('width')) / Number(img?.getAttribute('height')) || 4 / 3;
  const caption = figure.querySelector('figcaption')?.textContent?.length ?? 0;
  return {
    tall:
      width / ratio + Math.ceil(caption / (width / CAPTION_LETTER_PX)) * CAPTION_LINE_PX + FRAME_PX,
    perLine: (COLUMN_PX - width - GAP_PX) / LETTER_PX,
  };
}

/**
 * How much text (px) is missing beside a thumbnail placed before `blocks[start]`, up to what starts below it. The
 * thumbnails right before or after it stack with it, and the text has to go beside all of them.
 */
function missingFrom(blocks: Element[], start: number, size: Size) {
  let need = size.tall;
  for (let i = start - 1; i >= 0 && blocks[i]!.matches('figure.is-thumb'); i--) {
    need += measure(blocks[i] as HTMLElement).tall;
  }
  let height = 0;
  for (let i = start; i < blocks.length && height < need; i++) {
    const el = blocks[i]!;
    if (el.matches(CLEARS)) break;
    if (el.matches('figure.is-thumb')) need += measure(el as HTMLElement).tall;
    else height += textHeight(el, size.perLine);
  }
  return Math.max(0, need - height);
}

function textHeight(el: Element, perLine: number): number {
  const parts = el.matches('ul, ol') ? [...el.children] : [el];
  const lines = parts.reduce(
    (sum, part) => sum + Math.max(1, Math.ceil((part.textContent?.length ?? 0) / perLine)),
    0,
  );
  return lines * LINE_PX + 17;
}
