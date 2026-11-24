// Moves an article's thumbnails, before the first paint, to where there is enough text beside them.

import { COLUMN_PX } from './figures';
import type { TextType } from './reading';
import { fitsBeside, tableHeight } from './besideTables';
import type { Widen } from './balance';

const CLEARS = 'h2, hr, .table-scroll:not(.is-beside), .figure-row, figure.is-wide, .note-summary';
const HEADING = 'h2, h3, h4, .note-summary';
const START = 'p:not(.source), ul, ol, .callout';

// The captions' Inter at 12.8px: its average letter is about half an em wide.
const GAP_PX = 26;
const CAPTION_LINE_PX = 18.6;
const CAPTION_LETTER_PX = 7;
const FRAME_PX = 30;
/** What a caption's line loses to the frame and to the enlarge sign at its end. */
const CAPTION_INSET_PX = 40;
const NAV_PX = 38;
/**
 * Lines of text a stack of thumbnails may miss beside it. Past them it would leave a strip of more than a short
 * paragraph's height with nothing at its left: the last of the stack goes wide instead.
 */
const STRIP_LINES = 4;

/**
 * A thumbnail whose text runs out before a float-clearing block would leave an empty strip: it moves to the nearest
 * place of its section with enough text (down first, never past a heading). If its section has no such place, a short
 * table may go beside it (`is-beside`, narrowed to the rest of the column) when that fills the strip; or else it stays
 * where the strip is smallest. When that strip is of more than `STRIP_LINES` and the section has other figures (too many
 * for its text), the last thumbnail of the stack goes wide (`widen`) and every thumbnail is placed again.
 */
export function placeThumbs(root: DocumentFragment, type: TextType, widen: Widen) {
  const text: Text = { type, tables: false };
  while (placeAll(root, text, widen));
}

/** Places each thumbnail in turn; true when one of them went wide, so that the rest are placed again. */
function placeAll(root: DocumentFragment, text: Text, widen: Widen): boolean {
  for (const table of root.querySelectorAll('.is-beside')) table.classList.remove('is-beside');
  const thumbs = flow(root).filter((e) => e.matches('figure.is-thumb'));
  for (const figure of thumbs) {
    const blocks = flow(root).filter((e) => e !== figure);
    const at = flow(root).indexOf(figure);
    const size = measure(figure as HTMLElement, text);
    if (!missingFrom(blocks, at, size, text).missing) continue;
    const best = placeFor(blocks, at, size, text);
    if (
      best.crowded &&
      best.missing > STRIP_LINES * text.type.linePx &&
      widen(best.below.at(-1) ?? figure)
    ) {
      return true;
    }
    for (const table of best.tables) table.classList.add('is-beside');
    if (best.k !== at) blocks[best.k]!.before(figure);
  }
  return false;
}

/** Its best place, with a short table beside it when only that leaves no strip. */
function placeFor(blocks: Element[], at: number, size: Size, text: Text): Place {
  const best = bestPlace(blocks, at, size, text);
  if (!best.missing) return best;
  const withTables = bestPlace(blocks, at, size, { ...text, tables: true });
  return withTables.missing ? best : withTables;
}

interface Place {
  k: number;
  missing: number;
  tables: Element[];
  /** The thumbnails it would stack with, right above it and further down beside its text. */
  above: Element[];
  below: Element[];
  /** Whether its section has other figures: then a strip beside it is one of too many figures for the text. */
  crowded: boolean;
}

/** Where in its section the thumbnail at `at` misses the least text: the nearest place without any missing. */
function bestPlace(blocks: Element[], at: number, size: Size, text: Text): Place {
  let start = at;
  while (start > 0 && !blocks[start - 1]!.matches(HEADING)) start--;
  let end = at;
  while (end < blocks.length && !blocks[end]!.matches(HEADING)) end++;
  const places = [];
  for (let k = start; k <= end; k++) {
    if (k !== at && !blocks[k]?.matches(START)) continue;
    const far = Math.abs(k - at) * 2 + (k < at ? 1 : 0);
    places.push({ k, ...missingFrom(blocks, k, size, text), far });
  }
  places.sort((a, b) => a.far - b.far);
  const best =
    places.find((p) => !p.missing) ?? places.reduce((a, b) => (b.missing < a.missing ? b : a));
  const others = blocks.slice(start, end).some((b) => b.matches('figure.is-thumb, figure.is-wide'));
  return { ...best, crowded: others || best.above.length + best.below.length > 0 };
}

function flow(root: DocumentFragment): Element[] {
  return [...root.children].flatMap((e) => (e.matches('.side') ? [...e.children] : [e]));
}

interface Size {
  tall: number;
  perLine: number;
}

interface Text {
  type: TextType;
  /** Whether a short table counts as text beside the thumbnail. */
  tables: boolean;
}

/** Its height and how many letters fit in a line beside it, in the rest of the column. */
function measure(figure: HTMLElement, { type }: Text): Size {
  const width = parseFloat(figure.style.getPropertyValue('--fig')) * 16;
  const img = figure.querySelector('img');
  // A gallery's is its tallest slide's.
  const ratio =
    parseFloat(figure.style.getPropertyValue('--ar')) ||
    Number(img?.getAttribute('width')) / Number(img?.getAttribute('height')) ||
    4 / 3;
  // A gallery's captions share a place, as tall as the longest, under its arrows.
  const caption = Math.max(
    0,
    ...[...figure.querySelectorAll('figcaption')].map((c) => c.textContent.length),
  );
  const nav = figure.querySelector('.gallery-nav') ? NAV_PX : 0;
  return {
    tall:
      width / ratio +
      nav +
      Math.ceil(caption / ((width - CAPTION_INSET_PX) / CAPTION_LETTER_PX)) * CAPTION_LINE_PX +
      FRAME_PX,
    perLine: (COLUMN_PX - width - GAP_PX) / type.letterPx,
  };
}

/**
 * How far the thumbnails above push down one placed before `blocks[start]`: each one that reaches past the text between
 * it and there makes it start under its foot, so it needs text beside that part too.
 */
function pushedBy(blocks: Element[], start: number, size: Size, text: Text) {
  let push = 0;
  let between = 0;
  const above: Element[] = [];
  for (let i = start - 1; i >= 0 && !blocks[i]!.matches(CLEARS); i--) {
    const el = blocks[i]!;
    if (el.matches('figure.is-thumb')) {
      const over = measure(el as HTMLElement, text).tall - between;
      if (over > 0) {
        push += over;
        above.push(el);
      }
    } else between += textHeight(el, size.perLine, text.type);
  }
  return { push, above };
}

/** Text (px) missing beside a thumbnail placed before `blocks[start]`, counting the thumbnails that stack with it. */
function missingFrom(blocks: Element[], start: number, size: Size, text: Text) {
  const { push, above } = pushedBy(blocks, start, size, text);
  let need = size.tall + push;
  const below: Element[] = [];
  let height = 0;
  const tables: Element[] = [];
  for (let i = start; i < blocks.length && height < need; i++) {
    const el = blocks[i]!;
    const table = text.tables && fitsBeside(el);
    if (el.matches(CLEARS) && !table) break;
    if (table) tables.push(el);
    if (table) height += tableHeight(el, size.perLine * text.type.letterPx);
    else if (el.matches('figure.is-thumb')) {
      need += measure(el as HTMLElement, text).tall;
      below.push(el);
    } else height += textHeight(el, size.perLine, text.type);
  }
  return { missing: Math.max(0, need - height), tables, above, below };
}

function textHeight(el: Element, perLine: number, type: TextType): number {
  const parts = el.matches('ul, ol') ? [...el.children] : [el];
  const lines = parts.reduce(
    (sum, part) => sum + Math.max(1, Math.ceil(part.textContent.length / perLine)),
    0,
  );
  return lines * type.linePx + type.paraPx;
}
