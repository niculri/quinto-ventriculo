// Short tables that may sit beside a thumbnail, narrowed to the rest of the column, and how tall they are there.

/** At most three columns and six rows (the header too): a longer or wider one needs the whole column. */
const MAX_COLUMNS = 3;
const MAX_ROWS = 6;
// The tables' Inter at 14.4 px with lines of 1.5, its letters about half an em; a cell's padding and border.
const LINE_PX = 21.6;
const LETTER_PX = 7.2;
const CELL_X_PX = 24;
const CELL_Y_PX = 17;
/** Its margins (1.6 em of the article's letter, above and below). */
const MARGIN_PX = 54;

export function fitsBeside(el: Element): boolean {
  if (!el.matches('.table-scroll')) return false;
  const rows = [...el.querySelectorAll('tr')];
  const columns = Math.max(...rows.map((r) => r.children.length));
  return rows.length <= MAX_ROWS && columns <= MAX_COLUMNS;
}

/** Its height at `widthPx`, each column an equal share and each row as tall as its longest cell. */
export function tableHeight(el: Element, widthPx: number): number {
  const rows = [...el.querySelectorAll('tr')];
  const columns = Math.max(...rows.map((r) => r.children.length));
  const perLine = Math.max(1, (widthPx / columns - CELL_X_PX) / LETTER_PX);
  const cells = rows.map((r) =>
    Math.max(...[...r.children].map((c) => Math.ceil(c.textContent.length / perLine))),
  );
  return cells.reduce((sum, lines) => sum + lines * LINE_PX + CELL_Y_PX, MARGIN_PX);
}
