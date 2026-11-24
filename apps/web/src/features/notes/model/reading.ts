// How an article's letter reads, as the layout counts it before the first paint: its text fills the column.

/** What the article's layout needs from its letter: a line's height and a letter's width, in px. */
export interface TextType {
  linePx: number;
  letterPx: number;
  /** The space after a paragraph: one em. */
  paraPx: number;
}

/** QV Sans at 17 px with lines of 1.6: its average letter on the articles' Spanish text is 0.412 em. */
export const ARTICLE_TYPE: TextType = { linePx: 17 * 1.6, letterPx: 17 * 0.412, paraPx: 17 };
